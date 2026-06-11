"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "./Dialog";
import { Button, Checkbox, Input, Select, Spinner, ScoreBadge } from "./ui";
import { optimizar } from "@/lib/api";
import { formatCOP, formatPct, RIESGO_COLOR } from "@/lib/format";
import { TIPO_LABEL, ZONAS } from "@/lib/types";
import type { FrenteItem, TipoInmueble } from "@/lib/types";

const TIPOS: TipoInmueble[] = ["apto", "casa", "lote", "local"];

export function OptimizarModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [presupuesto, setPresupuesto] = useState<string>("500");
  const [zonas, setZonas] = useState<number[]>([]);
  const [tipos, setTipos] = useState<TipoInmueble[]>([]);
  const [tolerancia, setTolerancia] = useState<string>("medio");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frente, setFrente] = useState<FrenteItem[] | null>(null);

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  async function ejecutar() {
    setLoading(true);
    setError(null);
    try {
      const res = await optimizar({
        presupuesto_max: presupuesto ? Number(presupuesto) * 1_000_000 : undefined,
        zona_ids: zonas.length ? zonas : undefined,
        tipos: tipos.length ? tipos : undefined,
        tolerancia_riesgo: tolerancia,
      });
      setFrente(res.frente);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Optimizar con NSGA-II" maxWidth="max-w-3xl">
      <p className="mb-4 text-body-sm text-neutral-600">
        Frente de Pareto multicriterio: maximiza yield, minimiza precio y riesgo.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-label uppercase text-neutral-500">
            Presupuesto máximo (millones COP)
          </label>
          <Input
            type="number"
            value={presupuesto}
            onChange={(e) => setPresupuesto(e.target.value)}
            placeholder="500"
          />
        </div>
        <div>
          <label className="mb-1 block text-label uppercase text-neutral-500">
            Tolerancia al riesgo
          </label>
          <Select value={tolerancia} onChange={(e) => setTolerancia(e.target.value)}>
            <option value="bajo">Bajo</option>
            <option value="medio">Medio</option>
            <option value="alto">Alto</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-label uppercase text-neutral-500">Zonas</label>
          <div className="flex flex-col gap-1">
            {Object.entries(ZONAS).map(([id, nombre]) => (
              <Checkbox
                key={id}
                label={nombre}
                checked={zonas.includes(Number(id))}
                onChange={() => setZonas((z) => toggle(z, Number(id)))}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-label uppercase text-neutral-500">Tipos</label>
          <div className="flex flex-col gap-1">
            {TIPOS.map((t) => (
              <Checkbox
                key={t}
                label={TIPO_LABEL[t]}
                checked={tipos.includes(t)}
                onChange={() => setTipos((x) => toggle(x, t))}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button variant="amber" onClick={ejecutar} disabled={loading}>
          {loading ? <Spinner className="h-4 w-4" /> : null}
          Ejecutar optimización
        </Button>
        {error ? <span className="text-body-sm text-terra-600">{error}</span> : null}
      </div>

      {frente ? (
        <div className="mt-6">
          <h3 className="mb-2 text-h4 font-semibold text-brand-800">
            Frente de Pareto · {frente.length} inmuebles óptimos
          </h3>
          {frente.length === 0 ? (
            <p className="text-body-sm text-neutral-500">
              Sin resultados para esos criterios.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-neutral-200">
              <table className="w-full text-body-sm">
                <thead className="bg-neutral-100 text-label uppercase text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Score</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Zona</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Yield</th>
                    <th className="px-3 py-2 text-left">Riesgo</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {frente.map((f) => (
                    <tr key={f.inmueble_id} className="border-t border-neutral-100">
                      <td className="px-3 py-2">
                        <ScoreBadge score={f.score} size={30} />
                      </td>
                      <td className="px-3 py-2">{TIPO_LABEL[f.tipo] ?? f.tipo}</td>
                      <td className="px-3 py-2">
                        {f.zona_id ? ZONAS[f.zona_id] ?? f.zona_id : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatCOP(f.precio)}
                      </td>
                      <td
                        className="px-3 py-2 text-right font-mono"
                        style={{ color: f.yield_bruto > 6 ? "#2d7a5f" : undefined }}
                      >
                        {formatPct(f.yield_bruto)}
                      </td>
                      <td className="px-3 py-2">
                        <span style={{ color: RIESGO_COLOR[f.nivel_riesgo ?? "bajo"] }}>
                          {f.nivel_riesgo ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="text-body-sm font-semibold text-brand-700 hover:underline"
                          onClick={() => router.push(`/inmueble/${f.inmueble_id}`)}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
