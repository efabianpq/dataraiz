import type {
  Alerta,
  Filtros,
  InmuebleDetalle,
  InmuebleListItem,
  OptimizarResponse,
  Paginated,
  Watchlist,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const ADMIN_USER = process.env.NEXT_PUBLIC_ADMIN_USER ?? "admin";
const ADMIN_PASSWORD =
  process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "dataraiz_admin_2026";

const TOKEN_KEY = "dataraiz_token";

let tokenCache: string | null = null;

function getStoredToken(): string | null {
  if (tokenCache) return tokenCache;
  if (typeof window !== "undefined") {
    tokenCache = window.localStorage.getItem(TOKEN_KEY);
  }
  return tokenCache;
}

function setStoredToken(token: string): void {
  tokenCache = token;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
}

/** Login automático con el usuario admin del MVP (no hay pantalla de login). */
export async function ensureAuth(): Promise<string> {
  const existing = getStoredToken();
  if (existing) return existing;
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: ADMIN_USER, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error("No se pudo autenticar");
  const data = (await res.json()) as { access_token: string };
  setStoredToken(data.access_token);
  return data.access_token;
}

async function authFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = await ensureAuth();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401 && retry) {
    // Token expirado o inválido: re-autenticar una vez.
    tokenCache = null;
    if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
    return authFetch(path, init, false);
  }
  return res;
}

function buildQuery(filtros: Filtros, page: number, limit: number): string {
  const params = new URLSearchParams();
  if (filtros.precio_min != null) params.set("precio_min", String(filtros.precio_min));
  if (filtros.precio_max != null) params.set("precio_max", String(filtros.precio_max));
  if (filtros.tipo) params.set("tipo", filtros.tipo);
  if (filtros.zona_id != null) params.set("zona_id", String(filtros.zona_id));
  if (filtros.score_min != null) params.set("score_min", String(filtros.score_min));
  if (filtros.nivel_riesgo) params.set("nivel_riesgo", filtros.nivel_riesgo);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return params.toString();
}

// ---------- Endpoints públicos ----------

export async function listarInmuebles(
  filtros: Filtros = {},
  page = 1,
  limit = 20,
): Promise<Paginated<InmuebleListItem>> {
  const res = await fetch(
    `${API_URL}/api/inmuebles?${buildQuery(filtros, page, limit)}`,
  );
  if (!res.ok) throw new Error("Error al listar inmuebles");
  return res.json();
}

export async function getInmueble(id: number): Promise<InmuebleDetalle> {
  const res = await fetch(`${API_URL}/api/inmuebles/${id}`);
  if (res.status === 404) throw new Error("Inmueble no encontrado");
  if (!res.ok) throw new Error("Error al cargar el inmueble");
  return res.json();
}

// ---------- Endpoints protegidos ----------

export async function optimizar(body: {
  presupuesto_max?: number;
  zona_ids?: number[];
  tipos?: string[];
  tolerancia_riesgo?: string;
}): Promise<OptimizarResponse> {
  const res = await authFetch("/api/optimizar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Error al optimizar");
  return res.json();
}

export async function getWatchlist(): Promise<Watchlist[]> {
  const res = await authFetch("/api/watchlist");
  if (!res.ok) throw new Error("Error al cargar watchlist");
  return res.json();
}

export async function crearWatchlist(body: {
  nombre: string;
  filtros_json: Filtros;
  activa?: boolean;
}): Promise<Watchlist> {
  const res = await authFetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Error al crear watchlist");
  return res.json();
}

export async function eliminarWatchlist(id: number): Promise<void> {
  const res = await authFetch(`/api/watchlist/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Error al eliminar watchlist");
}

export async function getAlertas(): Promise<Alerta[]> {
  const res = await authFetch("/api/alertas");
  if (!res.ok) throw new Error("Error al cargar alertas");
  return res.json();
}

export async function marcarAlertaVista(id: number): Promise<void> {
  const res = await authFetch(`/api/alertas/${id}/vista`, { method: "PUT" });
  if (!res.ok) throw new Error("Error al marcar alerta");
}

/** Descarga el PDF del reporte (endpoint protegido). */
export async function descargarReporte(id: number): Promise<void> {
  const res = await authFetch(`/api/inmuebles/${id}/reporte`);
  if (!res.ok) throw new Error("Error al generar el reporte");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dataraiz-inmueble-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
