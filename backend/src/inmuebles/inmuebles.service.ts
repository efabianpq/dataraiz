import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ListarInmueblesDto } from './dto/listar-inmuebles.dto';

const RIESGO_RANK: Record<string, number> = { bajo: 1, medio: 2, alto: 3 };

export interface InmuebleListItem {
  id: number;
  tipo: string;
  precio: number | null;
  area_m2: number | null;
  habitaciones: number | null;
  lat: number | null;
  lng: number | null;
  score: number | null;
  prob_oportunidad: number | null;
  yield_bruto: number | null;
  cap_rate: number | null;
  nivel_riesgo: string | null;
  zona_id: number | null;
}

@Injectable()
export class InmueblesService {
  constructor(private readonly db: DatabaseService) {}

  /** Lista paginada con filtros, ordenada por score DESC (NULLS LAST). */
  async listar(q: ListarInmueblesDto): Promise<{
    data: InmuebleListItem[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  }> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace('$?', `$${params.length}`));
    };

    if (q.precio_min != null) add('i.precio >= $?', q.precio_min);
    if (q.precio_max != null) add('i.precio <= $?', q.precio_max);
    if (q.tipo) add('i.tipo = $?', q.tipo);
    if (q.zona_id != null) add('a.zona_id = $?', q.zona_id);
    if (q.score_min != null) add('a.score >= $?', q.score_min);
    if (q.nivel_riesgo) {
      // "nivel_riesgo máximo": incluye los niveles de igual o menor rango.
      add(
        `COALESCE(
           CASE a.nivel_riesgo WHEN 'bajo' THEN 1 WHEN 'medio' THEN 2 WHEN 'alto' THEN 3 END,
           1
         ) <= $?`,
        RIESGO_RANK[q.nivel_riesgo],
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRows = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::int AS total
         FROM inmueble i
         LEFT JOIN analisis_inmueble a ON a.inmueble_id = i.id
         ${whereSql}`,
      params,
    );
    const total = Number(totalRows[0]?.total ?? 0);

    const limit = q.limit;
    const offset = (q.page - 1) * limit;
    const dataParams = [...params, limit, offset];

    const data = await this.db.query<InmuebleListItem>(
      `SELECT
         i.id,
         i.tipo,
         i.precio,
         i.area_m2,
         i.habitaciones,
         ST_Y(i.geom) AS lat,
         ST_X(i.geom) AS lng,
         a.score,
         a.prob_oportunidad,
         a.yield_bruto,
         a.cap_rate,
         a.nivel_riesgo,
         a.zona_id
       FROM inmueble i
       LEFT JOIN analisis_inmueble a ON a.inmueble_id = i.id
       ${whereSql}
       ORDER BY a.score DESC NULLS LAST, i.id ASC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );

    return {
      data: data.map(this.castNumbers),
      total,
      page: q.page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Ficha completa: análisis + zona + 5 comparables. */
  async detalle(id: number): Promise<Record<string, unknown>> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT
         i.id,
         i.tipo,
         i.precio,
         i.area_m2,
         i.habitaciones,
         i.banos,
         i.direccion,
         i.descripcion,
         i.fuente,
         i.url_anuncio,
         ST_Y(i.geom) AS lat,
         ST_X(i.geom) AS lng,
         CASE WHEN i.precio IS NOT NULL AND i.area_m2 > 0
              THEN ROUND(i.precio / i.area_m2, 2) END AS precio_m2,
         a.valor_estimado,
         a.brecha,
         a.segmento,
         a.posicion_vs_mediana,
         a.prob_oportunidad,
         a.canon_estimado_mensual,
         a.yield_bruto,
         a.cap_rate,
         a.score,
         a.shap_json,
         a.dist_pot_m,
         a.dist_centrocentro_m,
         a.en_zona_riesgo,
         a.nivel_riesgo,
         a.zona_id,
         z.nombre AS zona_nombre,
         z.municipio AS zona_municipio,
         z.precio_m2_mediano AS zona_precio_m2_mediano
       FROM inmueble i
       LEFT JOIN analisis_inmueble a ON a.inmueble_id = i.id
       LEFT JOIN zona z ON z.id = a.zona_id
       WHERE i.id = $1`,
      [id],
    );

    if (!rows.length) {
      throw new NotFoundException(`Inmueble ${id} no encontrado`);
    }
    const inmueble = rows[0];

    const comparables = await this.db.query<Record<string, unknown>>(
      `SELECT
         c.comparable_id,
         c.distancia_pca,
         c.dif_precio_m2,
         c.posicion_vs_mediana,
         ci.tipo,
         ci.precio,
         ci.area_m2,
         CASE WHEN ci.precio IS NOT NULL AND ci.area_m2 > 0
              THEN ROUND(ci.precio / ci.area_m2, 2) END AS precio_m2,
         ca.zona_id,
         z.nombre AS zona_nombre,
         ca.score
       FROM comparable c
       JOIN inmueble ci ON ci.id = c.comparable_id
       LEFT JOIN analisis_inmueble ca ON ca.inmueble_id = ci.id
       LEFT JOIN zona z ON z.id = ca.zona_id
       WHERE c.inmueble_id = $1
       ORDER BY c.distancia_pca ASC NULLS LAST
       LIMIT 5`,
      [id],
    );

    return {
      ...coerceNumeric(inmueble, INMUEBLE_NUM_FIELDS),
      comparables: comparables.map((c) => coerceNumeric(c, COMPARABLE_NUM_FIELDS)),
    };
  }

  private castNumbers(r: InmuebleListItem): InmuebleListItem {
    const num = (v: unknown) => (v == null ? null : Number(v));
    return {
      ...r,
      precio: num(r.precio),
      area_m2: num(r.area_m2),
      lat: num(r.lat),
      lng: num(r.lng),
      score: num(r.score),
      prob_oportunidad: num(r.prob_oportunidad),
      yield_bruto: num(r.yield_bruto),
      cap_rate: num(r.cap_rate),
    };
  }
}

// node-postgres devuelve las columnas NUMERIC como strings (preserva precisión);
// las convertimos a number para que coincidan con los tipos del frontend.
const INMUEBLE_NUM_FIELDS = [
  "precio",
  "area_m2",
  "habitaciones",
  "banos",
  "lat",
  "lng",
  "precio_m2",
  "valor_estimado",
  "brecha",
  "segmento",
  "prob_oportunidad",
  "canon_estimado_mensual",
  "yield_bruto",
  "cap_rate",
  "score",
  "dist_pot_m",
  "dist_centrocentro_m",
  "zona_id",
  "zona_precio_m2_mediano",
] as const;

const COMPARABLE_NUM_FIELDS = [
  "comparable_id",
  "distancia_pca",
  "dif_precio_m2",
  "precio",
  "area_m2",
  "precio_m2",
  "zona_id",
  "score",
] as const;

function coerceNumeric<T extends Record<string, unknown>>(
  row: T,
  fields: readonly string[],
): T {
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    const v = out[f];
    out[f] = v == null || v === "" ? null : Number(v);
  }
  return out as T;
}
