"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { ShapChart } from "@/components/ShapChart";
import { Card, Pill, ScoreBadge, Spinner, Button } from "@/components/ui";
import { descargarReporte, getInmueble } from "@/lib/api";
import {
  formatCOPFull,
  formatMeters,
  formatPct,
  RIESGO_COLOR,
  señalInversion,
} from "@/lib/format";
import { TIPO_LABEL, ZONAS } from "@/lib/types";
import type { InmuebleDetalle, ShapItem } from "@/lib/types";

const MapaInmueble = dynamic(() => import("@/components/MapaInmueble"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-neutral-100">
      <Spinner />
    </div>
  ),
});

function parseShap(raw: InmuebleDetalle["shap_json"]): ShapItem[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ShapItem[];
    } catch {
      return [];
    }
  }
  return raw;
}

export default function InmueblePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [inm, setInm] = useState<InmuebleDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    getInmueble(id)
      .then((d) => activo && setInm(d))
      .catch((e) => activo && setError((e as Error).message))
      .finally(() => activo && setLoading(false));
    return () => {
      activo = false;
    };
  }, [id]);

  async function onDescargar() {
    setDescargando(true);
    try {
      await descargarReporte(id);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDescargando(false);
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="flex flex-1 items-center justify-center py-24">
          <Spinner />
        </div>
      </>
    );
  }

  if (error || !inm) {
    return (
      <>
        <Header />
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <p className="text-h3 text-terra-600">{error ?? "No encontrado"}</p>
          <Link href="/" className="mt-4 inline-block text-brand-700 hover:underline">
            ← Volver al dashboard
          </Link>
        </div>
      </>
    );
  }

  const señal = señalInversion(inm.score);
  const shap = parseShap(inm.shap_json);
  const brechaColor =
    inm.brecha == null ? "#403b38" : inm.brecha < 0 ? "#2d7a5f" : "#c45c2a";

  return (
    <>
      <Header active="dashboard" />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        {/* Breadcrumb */}
        <nav className="mb-5 text-body-sm text-neutral-500">
          <Link href="/" className="hover:text-brand-700">
            Dashboard
          </Link>
          <span className="mx-2">→</span>
          <span className="text-neutral-700">Inmueble #{inm.id}</span>
        </nav>

        {/* Sección superior */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="text-label uppercase tracking-wide text-neutral-400">
              {TIPO_LABEL[inm.tipo] ?? inm.tipo} ·{" "}
              {inm.zona_nombre ?? (inm.zona_id ? ZONAS[inm.zona_id] : "Zona N/D")}
            </p>
            <p className="mt-1 font-mono text-display font-bold text-brand-800">
              {formatCOPFull(inm.precio)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill className="bg-neutral-100 text-neutral-700">
                {inm.area_m2 ?? "—"} m²
              </Pill>
              <Pill className="bg-neutral-100 text-neutral-700">
                {inm.habitaciones ?? "—"} hab
              </Pill>
              <Pill className="bg-neutral-100 text-neutral-700">
                {inm.banos ?? "—"} baños
              </Pill>
              {inm.precio_m2 != null ? (
                <Pill className="bg-neutral-100 text-neutral-700">
                  {formatCOPFull(inm.precio_m2)}/m²
                </Pill>
              ) : null}
            </div>
            <div className="mt-5 flex items-center gap-4">
              <ScoreBadge score={inm.score} size={64} />
              <div>
                <p className="text-label uppercase text-neutral-400">Señal</p>
                <Pill color={señal.color} className="mt-1 text-body-sm">
                  {señal.label}
                </Pill>
              </div>
            </div>
          </div>

          <div className="h-[300px] overflow-hidden rounded-xl border border-neutral-200 shadow-card">
            {inm.lat != null && inm.lng != null ? (
              <MapaInmueble lat={inm.lat} lng={inm.lng} score={inm.score} />
            ) : (
              <div className="flex h-full items-center justify-center text-neutral-400">
                Sin geolocalización
              </div>
            )}
          </div>
        </div>

        {/* Análisis financiero */}
        <h2 className="mb-3 mt-10 text-h3 font-semibold text-brand-800">
          Análisis financiero
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-label uppercase text-neutral-400">
              Estimado por modelo
            </p>
            <p className="mt-1 font-mono text-h4 text-neutral-900">
              {formatCOPFull(inm.valor_estimado)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-label uppercase text-neutral-400">
              Brecha vs estimado
            </p>
            <p className="mt-1 font-mono text-h4" style={{ color: brechaColor }}>
              {inm.brecha == null ? "—" : `${inm.brecha.toFixed(1)} %`}
            </p>
            <p className="text-caption text-neutral-400">
              {inm.brecha == null
                ? ""
                : inm.brecha < 0
                  ? "Subvalorado"
                  : "Sobrevalorado"}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-label uppercase text-neutral-400">Yield bruto</p>
            <p
              className="mt-1 font-mono text-h4"
              style={{
                color:
                  inm.yield_bruto != null && inm.yield_bruto > 6
                    ? "#2d7a5f"
                    : "#403b38",
              }}
            >
              {formatPct(inm.yield_bruto)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-label uppercase text-neutral-400">Cap rate</p>
            <p className="mt-1 font-mono text-h4 text-neutral-900">
              {formatPct(inm.cap_rate)}
            </p>
            <p className="text-caption text-neutral-400">
              {inm.zona_precio_m2_mediano
                ? `Mediana zona ${formatCOPFull(inm.zona_precio_m2_mediano)}/m²`
                : ""}
            </p>
          </Card>
        </div>

        {/* Riesgo territorial */}
        <h2 className="mb-3 mt-10 text-h3 font-semibold text-brand-800">
          Nivel de riesgo territorial
        </h2>
        <Card className="flex flex-wrap items-center gap-6 p-5">
          <Pill
            color={inm.nivel_riesgo ? RIESGO_COLOR[inm.nivel_riesgo] : undefined}
            className="text-body-sm"
          >
            Riesgo {inm.nivel_riesgo ?? "N/D"}
          </Pill>
          <div>
            <p className="text-label uppercase text-neutral-400">
              Proyecto POT más cercano
            </p>
            <p className="font-mono text-body text-neutral-800">
              {formatMeters(inm.dist_pot_m)}
            </p>
          </div>
          <div>
            <p className="text-label uppercase text-neutral-400">
              Centro de Bucaramanga
            </p>
            <p className="font-mono text-body text-neutral-800">
              {formatMeters(inm.dist_centrocentro_m)}
            </p>
          </div>
          {inm.en_zona_riesgo ? (
            <Pill color="#c45c2a">En zona de riesgo</Pill>
          ) : null}
        </Card>

        {/* SHAP */}
        <h2 className="mb-1 mt-10 flex items-center gap-2 text-h3 font-semibold text-brand-800">
          <span aria-hidden>📊</span> ¿Por qué este score?
        </h2>
        <p className="mb-3 text-body-sm text-neutral-500">
          Contribución de cada variable al valor estimado del modelo (SHAP).
        </p>
        <Card className="p-5">
          {shap.length ? (
            <ShapChart shap={shap} />
          ) : (
            <p className="text-body-sm text-neutral-400">
              Sin datos de explicabilidad para este inmueble.
            </p>
          )}
        </Card>

        {/* Comparables */}
        <h2 className="mb-3 mt-10 text-h3 font-semibold text-brand-800">
          Propiedades comparables
        </h2>
        <Card className="overflow-hidden">
          <table className="w-full text-body-sm">
            <thead className="bg-neutral-100 text-label uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Zona</th>
                <th className="px-4 py-2 text-right">Precio/m²</th>
                <th className="px-4 py-2 text-right">Dif. vs este (%)</th>
              </tr>
            </thead>
            <tbody>
              {inm.comparables.map((c) => {
                const dif =
                  c.precio_m2 != null && inm.precio_m2
                    ? ((c.precio_m2 - inm.precio_m2) / inm.precio_m2) * 100
                    : null;
                return (
                  <tr key={c.comparable_id} className="border-t border-neutral-100">
                    <td className="px-4 py-2">{TIPO_LABEL[c.tipo] ?? c.tipo}</td>
                    <td className="px-4 py-2">
                      {c.zona_nombre ?? (c.zona_id ? ZONAS[c.zona_id] : "—")}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCOPFull(c.precio_m2)}
                    </td>
                    <td
                      className="px-4 py-2 text-right font-mono"
                      style={{ color: dif == null ? undefined : dif > 0 ? "#2d7a5f" : "#c45c2a" }}
                    >
                      {dif == null ? "—" : `${dif > 0 ? "+" : ""}${dif.toFixed(1)} %`}
                    </td>
                  </tr>
                );
              })}
              {inm.comparables.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    Sin comparables.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
        {inm.posicion_vs_mediana === "debajo" ? (
          <p className="mt-2 text-body-sm font-semibold text-brand-700">
            ✓ Este inmueble está por debajo de la mediana de su segmento.
          </p>
        ) : null}
      </div>

      {/* Botón flotante de descarga */}
      <Button
        onClick={onDescargar}
        disabled={descargando}
        className="fixed bottom-6 right-6 z-40 shadow-panel"
      >
        {descargando ? <Spinner className="h-4 w-4" /> : <span aria-hidden>⬇</span>}
        Descargar reporte PDF
      </Button>
    </>
  );
}
