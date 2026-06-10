import { sleep } from './utils';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_RATE_LIMIT_MS = 1100; // política de uso de Nominatim: máx. 1 req/seg
const USER_AGENT = 'DataRaiz/0.1 (proyecto academico, contacto: efabianpq@gmail.com)';

export interface LatLng {
  lat: number;
  lng: number;
}

const cache = new Map<string, LatLng | null>();
let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
  const wait = lastRequestAt + NOMINATIM_RATE_LIMIT_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/**
 * Geocodifica una dirección usando Nominatim (OpenStreetMap), restringido a
 * Colombia. Resultados en caché por proceso para no repetir consultas.
 */
export async function geocode(query: string): Promise<LatLng | null> {
  const cached = cache.get(query);
  if (cached !== undefined) return cached;

  await rateLimit();

  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=co&q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      cache.set(query, null);
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    const result: LatLng | null = data[0]
      ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      : null;
    cache.set(query, result);
    return result;
  } catch (err) {
    console.error(`[geocode] error consultando Nominatim para "${query}":`, (err as Error).message);
    cache.set(query, null);
    return null;
  }
}
