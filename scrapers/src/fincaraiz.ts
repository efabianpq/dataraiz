import { chromium } from 'playwright';
import { upsertInmueble, InmuebleInput, TipoInmueble } from './db';
import { geocode } from './geocode';
import { sleep } from './utils';

const BASE_URL = 'https://www.fincaraiz.com.co';
const STATE_SLUG = 'santander';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Slugs de tipo de propiedad usados en la URL de búsqueda de Fincaraíz,
// mapeados al enum `tipo` de la tabla `inmueble`.
const TYPE_SLUG_TO_TIPO: Record<string, TipoInmueble> = {
  apartamentos: 'apto',
  casas: 'casa',
  lotes: 'lote',
  locales: 'local',
};

// `property_type_id` devuelto por Fincaraíz para los tipos principales.
const PROPERTY_TYPE_ID_TO_TIPO: Record<number, TipoInmueble> = {
  1: 'casa',
  2: 'apto',
  3: 'lote',
};

// Bounding box laxo de Colombia continental, para descartar coordenadas
// claramente erróneas (0,0 u otros países) devueltas por la fuente.
const COLOMBIA_BBOX = { minLat: -4.3, maxLat: 13.5, minLng: -79.1, maxLng: -66.8 };

interface FincaraizPrice {
  amount: number | null;
  hidePrice?: boolean;
}

interface FincaraizListing {
  id: number;
  link: string;
  address: string | null;
  description: string | null;
  price: FincaraizPrice | null;
  m2: number | null;
  m2apto: number | null;
  m2Built: number | null;
  m2Terrain: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  latitude: number | null;
  longitude: number | null;
  property_type: { id: number; name: string } | null;
  property_type_id: number | null;
  locations?: { city?: Array<{ name: string }> };
}

interface PaginatorInfo {
  currentPage: number;
  lastPage: number;
  total: number;
}

interface NextDataShape {
  props?: {
    pageProps?: {
      fetchResult?: {
        searchFast?: {
          data?: FincaraizListing[];
          paginatorInfo?: PaginatorInfo;
        };
      };
    };
  };
}

export interface ScrapeOptions {
  cities?: string[];
  propertyTypeSlugs?: string[];
  maxPagesPerCombo?: number;
  rateLimitMs?: number;
}

export interface ScrapeStats {
  pagesVisited: number;
  itemsFound: number;
  inserted: number;
  updated: number;
  conGeom: number;
  geocodificados: number;
  errores: number;
}

function defaultCities(): string[] {
  const raw = process.env.PILOT_CITIES ?? 'bucaramanga,floridablanca,giron,piedecuesta';
  return raw
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

function isValidColombianLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !(lat === 0 && lng === 0) &&
    lat >= COLOMBIA_BBOX.minLat &&
    lat <= COLOMBIA_BBOX.maxLat &&
    lng >= COLOMBIA_BBOX.minLng &&
    lng <= COLOMBIA_BBOX.maxLng
  );
}

function mapTipo(item: FincaraizListing, fallback: TipoInmueble): TipoInmueble {
  if (item.property_type_id != null && PROPERTY_TYPE_ID_TO_TIPO[item.property_type_id]) {
    return PROPERTY_TYPE_ID_TO_TIPO[item.property_type_id];
  }
  return fallback;
}

function pickAreaM2(item: FincaraizListing): number | null {
  for (const candidate of [item.m2, item.m2apto, item.m2Built, item.m2Terrain]) {
    if (typeof candidate === 'number' && candidate > 0) return candidate;
  }
  return null;
}

function pickPrecio(item: FincaraizListing): number | null {
  const price = item.price;
  if (!price || price.hidePrice) return null;
  return typeof price.amount === 'number' && price.amount > 0 ? price.amount : null;
}

interface ProcessResult {
  inserted: boolean;
  conGeom: boolean;
  geocodificado: boolean;
}

async function processItem(
  item: FincaraizListing,
  fallbackTipo: TipoInmueble,
  citySlug: string,
): Promise<ProcessResult | null> {
  if (!item.link) return null;
  const url_anuncio = `${BASE_URL}${item.link}`;

  let lat: number | null = item.latitude;
  let lng: number | null = item.longitude;
  let geocodificado = false;

  if (!isValidColombianLatLng(lat, lng)) {
    const direccion = item.address;
    const cityName = item.locations?.city?.[0]?.name ?? citySlug;
    if (direccion) {
      const geo = await geocode(`${direccion}, ${cityName}, Santander, Colombia`);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        geocodificado = true;
      } else {
        lat = null;
        lng = null;
      }
    } else {
      lat = null;
      lng = null;
    }
  }

  const input: InmuebleInput = {
    fuente: 'fincaraiz',
    url_anuncio,
    tipo: mapTipo(item, fallbackTipo),
    precio: pickPrecio(item),
    area_m2: pickAreaM2(item),
    habitaciones: typeof item.bedrooms === 'number' ? item.bedrooms : null,
    banos: typeof item.bathrooms === 'number' ? item.bathrooms : null,
    direccion: item.address ?? null,
    descripcion: item.description ?? null,
    lat,
    lng,
  };

  const { inserted } = await upsertInmueble(input);
  return { inserted, conGeom: lat !== null && lng !== null, geocodificado };
}

function buildSearchUrl(typeSlug: string, citySlug: string, pageNum: number): string {
  const path = `/venta/${typeSlug}/${citySlug}/${STATE_SLUG}`;
  return pageNum <= 1 ? `${BASE_URL}${path}` : `${BASE_URL}${path}/pagina${pageNum}`;
}

/**
 * Scrapea anuncios de Fincaraíz para las ciudades y tipos de propiedad dados,
 * recorriendo páginas de resultados de búsqueda (cada página trae ~21
 * anuncios con datos estructurados, incluyendo lat/lng cuando están
 * disponibles) y los guarda/actualiza en la tabla `inmueble`.
 */
export async function scrapeFincaraiz(options: ScrapeOptions = {}): Promise<ScrapeStats> {
  const cities = options.cities ?? defaultCities();
  const propertyTypeSlugs = options.propertyTypeSlugs ?? Object.keys(TYPE_SLUG_TO_TIPO);
  const maxPagesPerCombo = options.maxPagesPerCombo ?? Number(process.env.SCRAPING_MAX_PAGES ?? 2);
  const rateLimitMs = options.rateLimitMs ?? Number(process.env.SCRAPING_RATE_LIMIT_MS ?? 1000);

  const stats: ScrapeStats = {
    pagesVisited: 0,
    itemsFound: 0,
    inserted: 0,
    updated: 0,
    conGeom: 0,
    geocodificados: 0,
    errores: 0,
  };

  const seenUrls = new Set<string>();
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });

    // No necesitamos imágenes/estilos: los datos vienen embebidos como JSON
    // en el HTML (__NEXT_DATA__). Bloquearlos acelera mucho el scraping.
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'font', 'stylesheet', 'media'].includes(resourceType)) {
        void route.abort();
      } else {
        void route.continue();
      }
    });

    for (const citySlug of cities) {
      for (const typeSlug of propertyTypeSlugs) {
        const fallbackTipo = TYPE_SLUG_TO_TIPO[typeSlug];
        if (!fallbackTipo) {
          console.warn(`[fincaraiz] tipo de propiedad desconocido, se omite: ${typeSlug}`);
          continue;
        }

        let lastPage = 1;
        for (let pageNum = 1; pageNum <= Math.min(maxPagesPerCombo, lastPage); pageNum++) {
          const url = buildSearchUrl(typeSlug, citySlug, pageNum);
          const start = Date.now();
          let nextData: NextDataShape | null = null;

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
              nextData = await page.evaluate(() => (globalThis as any).__NEXT_DATA__);
              break;
            } catch (err) {
              stats.errores++;
              console.error(
                `[fincaraiz] error cargando ${url} (intento ${attempt}/3): ${(err as Error).message}`,
              );
              if (attempt < 3) await sleep(2 ** attempt * 1000);
            }
          }
          stats.pagesVisited++;

          const searchFast = nextData?.props?.pageProps?.fetchResult?.searchFast;
          const items = searchFast?.data ?? [];
          lastPage = searchFast?.paginatorInfo?.lastPage ?? lastPage;

          console.log(
            `[fincaraiz] ${citySlug}/${typeSlug} pagina ${pageNum}/${lastPage}: ${items.length} anuncios`,
          );

          for (const item of items) {
            stats.itemsFound++;
            const url_anuncio = item.link ? `${BASE_URL}${item.link}` : null;
            if (!url_anuncio || seenUrls.has(url_anuncio)) continue;
            seenUrls.add(url_anuncio);

            try {
              const result = await processItem(item, fallbackTipo, citySlug);
              if (!result) continue;
              if (result.inserted) stats.inserted++;
              else stats.updated++;
              if (result.conGeom) stats.conGeom++;
              if (result.geocodificado) stats.geocodificados++;
            } catch (err) {
              stats.errores++;
              console.error(
                `[fincaraiz] error procesando anuncio ${item.id}: ${(err as Error).message}`,
              );
            }
          }

          const elapsed = Date.now() - start;
          if (elapsed < rateLimitMs) await sleep(rateLimitMs - elapsed);
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log('[fincaraiz] resumen:', JSON.stringify(stats));
  return stats;
}
