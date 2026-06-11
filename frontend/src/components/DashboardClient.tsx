"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Button, Checkbox, Select, Slider, Spinner } from "@/components/ui";
import { TablaInmuebles } from "@/components/TablaInmuebles";
import { OptimizarModal } from "@/components/OptimizarModal";
import { listarInmuebles } from "@/lib/api";
import { formatPct, type ScoreCat } from "@/lib/format";
import { TIPO_LABEL, ZONAS } from "@/lib/types";
import type { InmuebleListItem, NivelRiesgo, TipoInmueble } from "@/lib/types";

const MapaInmuebles = dynamic(() => import("@/components/MapaInmuebles"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-neutral-100">
      <Spinner />
    </div>
  ),
});

const TIPOS: TipoInmueble[] = ["apto", "casa", "lote", "local"];
const TODAS_CATEGORIAS: ScoreCat[] = ["verde", "amarillo", "rojo", "gris"];

/** Tarjeta de métrica con borde superior de color (mockup del Brand Guide). */
function MetricCard({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-card">
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: color }}
      />
      <div className="text-label uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-1.5 text-h2 font-bold text-neutral-900">{value}</div>
      {hint ? (
        <div className="text-caption text-neutral-400">{hint}</div>
      ) : null}
    </div>
  );
}

interface FiltrosState {
  precioMin: number; // millones
  precioMax: number; // millones
  tipos: TipoInmueble[];
  scoreMin: number;
  riesgoMax: "" | NivelRiesgo;
  zonas: number[];
}

const DEFAULTS: FiltrosState = {
  precioMin: 0,
  precioMax: 2000,
  tipos: [],
  scoreMin: 0,
  riesgoMax: "",
  zonas: [],
};

export function DashboardClient() {
  const router = useRouter();
  const search = useSearchParams();

  // Filtros iniciales desde la URL (bookmarkeables / "Aplicar al mapa").
  const initial = useMemo<FiltrosState>(() => {
    const f = { ...DEFAULTS };
    if (search.get("precio_max")) f.precioMax = Number(search.get("precio_max")) / 1e6;
    if (search.get("precio_min")) f.precioMin = Number(search.get("precio_min")) / 1e6;
    if (search.get("score_min")) f.scoreMin = Number(search.get("score_min"));
    if (search.get("tipo")) f.tipos = [search.get("tipo") as TipoInmueble];
    if (search.get("zona_id")) f.zonas = [Number(search.get("zona_id"))];
    if (search.get("nivel_riesgo"))
      f.riesgoMax = search.get("nivel_riesgo") as NivelRiesgo;
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState<FiltrosState>(initial);
  const [applied, setApplied] = useState<FiltrosState>(initial);
  const [inmuebles, setInmuebles] = useState<InmuebleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Categorías de color de pin visibles en el mapa (verde/amarillo/rojo/gris).
  const [categorias, setCategorias] = useState<Set<ScoreCat>>(
    () => new Set(TODAS_CATEGORIAS),
  );
  const toggleCategoria = (cat: ScoreCat) =>
    setCategorias((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  const fetchData = useCallback(async (f: FiltrosState) => {
    setLoading(true);
    setError(null);
    try {
      // El backend filtra por valor único; pedimos un set amplio con los
      // filtros server-side y refinamos tipo/zona (multi) en cliente.
      const res = await listarInmuebles(
        {
          precio_min: f.precioMin > 0 ? f.precioMin * 1e6 : undefined,
          precio_max: f.precioMax < 2000 ? f.precioMax * 1e6 : undefined,
          score_min: f.scoreMin > 0 ? f.scoreMin : undefined,
          nivel_riesgo: f.riesgoMax || undefined,
        },
        1,
        600,
      );
      let data = res.data;
      if (f.tipos.length) data = data.filter((i) => f.tipos.includes(i.tipo));
      if (f.zonas.length)
        data = data.filter((i) => i.zona_id != null && f.zonas.includes(i.zona_id));
      setInmuebles(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(applied);
  }, [applied, fetchData]);

  const aplicar = () => setApplied(draft);

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  // Métricas resumidas del set filtrado (tarjetas superiores).
  const metricas = useMemo(() => {
    const scores = inmuebles.map((i) => i.score).filter((s): s is number => s != null);
    const yields = inmuebles
      .map((i) => i.yield_bruto)
      .filter((y): y is number => y != null);
    const prom = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    return {
      total: inmuebles.length,
      scoreProm: prom(scores),
      yieldProm: prom(yields),
      oportunidades: inmuebles.filter(
        (i) => i.prob_oportunidad != null && i.prob_oportunidad > 0.7,
      ).length,
    };
  }, [inmuebles]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar de filtros */}
      <aside className="flex w-sidebar shrink-0 flex-col overflow-y-auto bg-brand-900 text-white">
        <div className="flex items-center gap-2 px-panel-p py-5">
          <Image src="/logo.svg" alt="DataRaíz" width={28} height={38} />
          <span className="text-h4 font-bold">
            Data<span className="text-amber-300">Raíz</span>
          </span>
        </div>

        <div className="flex flex-col gap-6 px-panel-p pb-6">
          {/* Precio */}
          <div>
            <label className="mb-2 block text-label uppercase text-brand-100">
              Precio (millones COP)
            </label>
            <div className="text-body-sm font-mono text-brand-50">
              ${draft.precioMin} M – ${draft.precioMax}
              {draft.precioMax >= 2000 ? "+" : ""} M
            </div>
            <Slider
              min={0}
              max={2000}
              step={10}
              value={draft.precioMin}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  precioMin: Math.min(Number(e.target.value), d.precioMax),
                }))
              }
            />
            <Slider
              min={0}
              max={2000}
              step={10}
              value={draft.precioMax}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  precioMax: Math.max(Number(e.target.value), d.precioMin),
                }))
              }
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="mb-2 block text-label uppercase text-brand-100">
              Tipo
            </label>
            <div className="flex flex-col gap-1.5">
              {TIPOS.map((t) => (
                <Checkbox
                  key={t}
                  label={TIPO_LABEL[t]}
                  checked={draft.tipos.includes(t)}
                  onChange={() =>
                    setDraft((d) => ({ ...d, tipos: toggle(d.tipos, t) }))
                  }
                />
              ))}
            </div>
          </div>

          {/* Score mínimo */}
          <div>
            <label className="mb-2 block text-label uppercase text-brand-100">
              Score mínimo: {draft.scoreMin}
            </label>
            <Slider
              min={0}
              max={100}
              step={1}
              value={draft.scoreMin}
              onChange={(e) =>
                setDraft((d) => ({ ...d, scoreMin: Number(e.target.value) }))
              }
            />
          </div>

          {/* Riesgo máximo */}
          <div>
            <label className="mb-2 block text-label uppercase text-brand-100">
              Nivel de riesgo máximo
            </label>
            <Select
              className="text-neutral-900"
              value={draft.riesgoMax}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  riesgoMax: e.target.value as "" | NivelRiesgo,
                }))
              }
            >
              <option value="">Cualquiera</option>
              <option value="bajo">Bajo</option>
              <option value="medio">Medio</option>
              <option value="alto">Alto</option>
            </Select>
          </div>

          {/* Zonas */}
          <div>
            <label className="mb-2 block text-label uppercase text-brand-100">
              Zona
            </label>
            <div className="flex flex-col gap-1.5">
              {Object.entries(ZONAS).map(([id, nombre]) => (
                <Checkbox
                  key={id}
                  label={nombre}
                  checked={draft.zonas.includes(Number(id))}
                  onChange={() =>
                    setDraft((d) => ({ ...d, zonas: toggle(d.zonas, Number(id)) }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button variant="amber" onClick={aplicar}>
              Aplicar filtros
            </Button>
            <Button variant="outlineLight" onClick={() => setModalOpen(true)}>
              Optimizar con NSGA-II
            </Button>
            <div className="mt-1 text-center text-caption text-brand-100">
              {loading ? "Cargando…" : `${inmuebles.length} resultados`}
            </div>
          </div>
        </div>
      </aside>

      {/* Área principal */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barra superior */}
        <header className="flex h-header shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-panel-p">
          <div>
            <h1 className="text-h4 font-semibold text-neutral-900">
              Tablero de inversión
            </h1>
            <p className="text-caption text-neutral-500">
              Área Metropolitana de Bucaramanga
            </p>
          </div>
          <div className="text-right">
            <div className="text-caption uppercase text-neutral-400">
              Resultados
            </div>
            <div className="text-h4 font-bold text-brand-700">
              {loading ? "…" : metricas.total}
            </div>
          </div>
        </header>

        {/* Tarjetas de métricas */}
        <div className="grid shrink-0 grid-cols-2 gap-4 px-panel-p pt-panel-p lg:grid-cols-4">
          <MetricCard
            label="Inmuebles"
            value={loading ? "…" : String(metricas.total)}
            hint="en el filtro actual"
            color="#3a9673"
          />
          <MetricCard
            label="Score promedio"
            value={
              loading || metricas.scoreProm == null
                ? "—"
                : String(Math.round(metricas.scoreProm))
            }
            hint="de 100"
            color="#d4943a"
          />
          <MetricCard
            label="Yield bruto prom."
            value={loading ? "—" : formatPct(metricas.yieldProm)}
            hint="anual estimado"
            color="#2563a8"
          />
          <MetricCard
            label="Oportunidades"
            value={loading ? "…" : String(metricas.oportunidades)}
            hint="prob. > 70%"
            color="#c45c2a"
          />
        </div>

        {error ? (
          <div className="mx-panel-p mt-panel-p rounded-lg border border-terra-200 bg-terra-50 px-4 py-3 text-body-sm text-terra-700">
            {error}
          </div>
        ) : null}

        {/* Mapa (siempre visible) + panel lateral de resultados con scroll */}
        <div className="flex min-h-0 flex-1 gap-4 p-panel-p">
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 shadow-card">
            {loading ? (
              <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-caption text-neutral-600 shadow-card">
                <Spinner /> Cargando…
              </div>
            ) : null}
            <MapaInmuebles
              inmuebles={inmuebles}
              onSelect={(id) => router.push(`/inmueble/${id}`)}
              categorias={categorias}
              onToggleCategoria={toggleCategoria}
            />
          </div>
          <div className="hidden w-[400px] shrink-0 md:block">
            <TablaInmuebles inmuebles={inmuebles} />
          </div>
        </div>
      </main>

      <OptimizarModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
