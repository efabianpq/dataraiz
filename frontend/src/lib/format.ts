import type { NivelRiesgo } from "./types";

/** Formatea COP de forma compacta cuando es grande. */
export function formatCOP(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)} MM`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)} M`;
  return `$${Number(v).toLocaleString("es-CO")}`;
}

/** COP completo con separadores de miles. */
export function formatCOPFull(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$ ${Number(v).toLocaleString("es-CO")}`;
}

export function formatPct(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  return `${Number(v).toFixed(digits)} %`;
}

export function formatMeters(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)} km`;
  return `${Math.round(v)} m`;
}

/** Color de marca según el rango del score (pines y badges). */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#79716e";
  if (score >= 85) return "#3a9673"; // brand-500
  if (score >= 70) return "#2563a8"; // data-500
  if (score >= 50) return "#d4943a"; // amber-500
  return "#c45c2a"; // terra-500
}

/* ------------------------------------------------------------------
   Categorías de color para los pines del mapa (verde/amarillo/rojo/gris).
   Permiten filtrar el mapa por nivel de score.
   ------------------------------------------------------------------ */
export type ScoreCat = "verde" | "amarillo" | "rojo" | "gris";

export const SCORE_CATS: {
  key: ScoreCat;
  label: string;
  rango: string;
  color: string;
}[] = [
  { key: "verde", label: "Alto", rango: "≥ 70", color: "#3a9673" },
  { key: "amarillo", label: "Medio", rango: "50–69", color: "#d4943a" },
  { key: "rojo", label: "Bajo", rango: "< 50", color: "#c45c2a" },
  { key: "gris", label: "Sin score", rango: "—", color: "#79716e" },
];

/** Categoría de color de un score para los pines del mapa. */
export function scoreCategoria(score: number | null | undefined): ScoreCat {
  if (score == null) return "gris";
  if (score >= 70) return "verde";
  if (score >= 50) return "amarillo";
  return "rojo";
}

/** Color del pin según su categoría de score. */
export function categoriaColor(score: number | null | undefined): string {
  const cat = scoreCategoria(score);
  return SCORE_CATS.find((c) => c.key === cat)!.color;
}

export const RIESGO_COLOR: Record<NivelRiesgo, string> = {
  bajo: "#3a9673",
  medio: "#d4943a",
  alto: "#c45c2a",
};

/** Señal de inversión derivada del score. */
export function señalInversion(score: number | null | undefined): {
  label: string;
  color: string;
} {
  if (score == null) return { label: "Sin datos", color: "#79716e" };
  if (score >= 85) return { label: "Comprar", color: "#3a9673" };
  if (score >= 70) return { label: "Mantener", color: "#2563a8" };
  if (score >= 50) return { label: "Vigilar", color: "#d4943a" };
  return { label: "Evitar", color: "#c45c2a" };
}
