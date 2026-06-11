export type TipoInmueble = "apto" | "casa" | "lote" | "local";
export type NivelRiesgo = "bajo" | "medio" | "alto";

export interface InmuebleListItem {
  id: number;
  tipo: TipoInmueble;
  precio: number | null;
  area_m2: number | null;
  habitaciones: number | null;
  lat: number | null;
  lng: number | null;
  score: number | null;
  prob_oportunidad: number | null;
  yield_bruto: number | null;
  cap_rate: number | null;
  nivel_riesgo: NivelRiesgo | null;
  zona_id: number | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ShapItem {
  feature: string;
  value: number;
  impact: number;
}

export interface Comparable {
  comparable_id: number;
  distancia_pca: number | null;
  dif_precio_m2: number | null;
  posicion_vs_mediana: string | null;
  tipo: TipoInmueble;
  precio: number | null;
  area_m2: number | null;
  precio_m2: number | null;
  zona_id: number | null;
  zona_nombre: string | null;
  score: number | null;
}

export interface InmuebleDetalle {
  id: number;
  tipo: TipoInmueble;
  precio: number | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  direccion: string | null;
  descripcion: string | null;
  fuente: string | null;
  url_anuncio: string | null;
  lat: number | null;
  lng: number | null;
  precio_m2: number | null;
  valor_estimado: number | null;
  brecha: number | null;
  segmento: number | null;
  posicion_vs_mediana: string | null;
  prob_oportunidad: number | null;
  canon_estimado_mensual: number | null;
  yield_bruto: number | null;
  cap_rate: number | null;
  score: number | null;
  shap_json: ShapItem[] | string | null;
  dist_pot_m: number | null;
  dist_centrocentro_m: number | null;
  en_zona_riesgo: boolean | null;
  nivel_riesgo: NivelRiesgo | null;
  zona_id: number | null;
  zona_nombre: string | null;
  zona_municipio: string | null;
  zona_precio_m2_mediano: number | null;
  comparables: Comparable[];
}

export interface Filtros {
  precio_min?: number;
  precio_max?: number;
  tipo?: TipoInmueble;
  zona_id?: number;
  score_min?: number;
  nivel_riesgo?: NivelRiesgo;
}

export interface FrenteItem {
  inmueble_id: number;
  tipo: TipoInmueble;
  precio: number;
  area_m2: number | null;
  zona_id: number | null;
  yield_bruto: number;
  nivel_riesgo: NivelRiesgo | null;
  prob_oportunidad: number | null;
  score: number | null;
}

export interface OptimizarResponse {
  n_candidatos?: number;
  n_frente: number;
  frente: FrenteItem[];
}

export interface Alerta {
  id: number;
  inmueble_id: number;
  fecha: string;
  estado: string;
  tipo: TipoInmueble;
  precio: number | null;
  score: number | null;
  prob_oportunidad: number | null;
  yield_bruto: number | null;
  nivel_riesgo: NivelRiesgo | null;
  zona_nombre: string | null;
}

export interface Watchlist {
  id: number;
  usuario_id: number;
  nombre: string;
  filtros_json: Filtros;
  activa: boolean;
  created_at: string;
}

export const ZONAS: Record<number, string> = {
  1: "Bucaramanga",
  2: "Floridablanca",
  3: "Girón",
  4: "Piedecuesta",
};

export const TIPO_LABEL: Record<TipoInmueble, string> = {
  apto: "Apartamento",
  casa: "Casa",
  lote: "Lote",
  local: "Local",
};
