import { Pool } from 'pg';

export type TipoInmueble = 'apto' | 'casa' | 'lote' | 'local';

export interface InmuebleInput {
  fuente: string;
  url_anuncio: string;
  tipo: TipoInmueble;
  precio: number | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  direccion: string | null;
  descripcion: string | null;
  lat: number | null;
  lng: number | null;
}

export interface UpsertResult {
  id: number;
  inserted: boolean;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const UPSERT_SQL = `
  INSERT INTO inmueble (
    fuente, url_anuncio, tipo, precio, area_m2, habitaciones, banos,
    direccion, descripcion, geom, fecha_captura, updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9,
    CASE WHEN $10::double precision IS NOT NULL AND $11::double precision IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint($11, $10), 4326)
         ELSE NULL END,
    now(), now()
  )
  ON CONFLICT (url_anuncio) DO UPDATE SET
    tipo = EXCLUDED.tipo,
    precio = EXCLUDED.precio,
    area_m2 = EXCLUDED.area_m2,
    habitaciones = EXCLUDED.habitaciones,
    banos = EXCLUDED.banos,
    direccion = EXCLUDED.direccion,
    descripcion = EXCLUDED.descripcion,
    geom = COALESCE(EXCLUDED.geom, inmueble.geom),
    updated_at = now()
  RETURNING id, (xmax = 0) AS inserted
`;

export async function upsertInmueble(data: InmuebleInput): Promise<UpsertResult> {
  const { rows } = await pool.query(UPSERT_SQL, [
    data.fuente,
    data.url_anuncio,
    data.tipo,
    data.precio,
    data.area_m2,
    data.habitaciones,
    data.banos,
    data.direccion,
    data.descripcion,
    data.lat,
    data.lng,
  ]);
  return { id: rows[0].id as number, inserted: rows[0].inserted as boolean };
}

export async function closePool(): Promise<void> {
  await pool.end();
}
