"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, ScoreBadge } from "./ui";
import { formatCOP, formatPct, RIESGO_COLOR } from "@/lib/format";
import { TIPO_LABEL, ZONAS } from "@/lib/types";
import type { InmuebleListItem } from "@/lib/types";

type SortKey = "score" | "precio" | "yield_bruto";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "precio", label: "Precio" },
  { key: "yield_bruto", label: "Yield" },
];

export function TablaInmuebles({ inmuebles }: { inmuebles: InmuebleListItem[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("score");

  const ordenados = [...inmuebles].sort((a, b) => {
    const av = a[sort] ?? -Infinity;
    const bv = b[sort] ?? -Infinity;
    return Number(bv) - Number(av);
  });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
      {/* Encabezado del panel */}
      <div className="shrink-0 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-h4 font-semibold text-brand-800">Oportunidades</h2>
          <span className="font-mono text-caption text-neutral-500">
            {ordenados.length} resultados
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <span className="mr-1 text-label uppercase text-neutral-400">
            Ordenar
          </span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={`rounded-md px-2.5 py-1 text-caption font-semibold transition-colors ${
                sort === s.key
                  ? "bg-brand-800 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista con scroll propio */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ordenados.length === 0 ? (
          <div className="px-4 py-10 text-center text-body-sm text-neutral-400">
            No hay inmuebles que cumplan los filtros.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {ordenados.map((inm) => (
              <li key={inm.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/inmueble/${inm.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50"
                >
                  <ScoreBadge score={inm.score} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-body-sm font-semibold text-neutral-800">
                        {TIPO_LABEL[inm.tipo] ?? inm.tipo}
                      </span>
                      <span className="truncate text-caption text-neutral-500">
                        {inm.zona_id ? ZONAS[inm.zona_id] ?? inm.zona_id : "—"}
                      </span>
                      {inm.nivel_riesgo ? (
                        <Pill
                          color={RIESGO_COLOR[inm.nivel_riesgo]}
                          className="ml-auto shrink-0"
                        >
                          {inm.nivel_riesgo}
                        </Pill>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 font-mono text-caption">
                      <span className="font-semibold text-neutral-900">
                        {formatCOP(inm.precio)}
                      </span>
                      <span
                        style={{
                          color:
                            inm.yield_bruto != null && inm.yield_bruto > 6
                              ? "#2d7a5f"
                              : "#79716e",
                          fontWeight:
                            inm.yield_bruto != null && inm.yield_bruto > 6
                              ? 700
                              : 400,
                        }}
                      >
                        Yield {formatPct(inm.yield_bruto)}
                      </span>
                      <span className="text-neutral-400">
                        Cap {formatPct(inm.cap_rate)}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
