"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Dialog } from "@/components/Dialog";
import {
  Button,
  Card,
  Input,
  Pill,
  ScoreBadge,
  Select,
  Spinner,
} from "@/components/ui";
import {
  crearWatchlist,
  eliminarWatchlist,
  getAlertas,
  getWatchlist,
  marcarAlertaVista,
} from "@/lib/api";
import { formatCOP, formatPct, RIESGO_COLOR } from "@/lib/format";
import { TIPO_LABEL, ZONAS } from "@/lib/types";
import type {
  Alerta,
  Filtros,
  TipoInmueble,
  Watchlist,
} from "@/lib/types";

function filtrosLegibles(f: Filtros): string {
  const parts: string[] = [];
  if (f.tipo) parts.push(TIPO_LABEL[f.tipo]);
  if (f.zona_id) parts.push(ZONAS[f.zona_id] ?? `Zona ${f.zona_id}`);
  if (f.score_min != null) parts.push(`Score ≥ ${f.score_min}`);
  if (f.precio_max != null) parts.push(`≤ ${formatCOP(f.precio_max)}`);
  if (f.precio_min != null) parts.push(`≥ ${formatCOP(f.precio_min)}`);
  if (f.nivel_riesgo) parts.push(`Riesgo ${f.nivel_riesgo}`);
  return parts.length ? parts.join(" · ") : "Sin criterios";
}

function filtrosToQuery(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.zona_id != null) p.set("zona_id", String(f.zona_id));
  if (f.score_min != null) p.set("score_min", String(f.score_min));
  if (f.precio_max != null) p.set("precio_max", String(f.precio_max));
  if (f.precio_min != null) p.set("precio_min", String(f.precio_min));
  if (f.nivel_riesgo) p.set("nivel_riesgo", f.nivel_riesgo);
  return p.toString();
}

export default function WatchlistPage() {
  const router = useRouter();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [listas, setListas] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  // Formulario de nueva búsqueda.
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"" | TipoInmueble>("");
  const [zona, setZona] = useState<string>("");
  const [scoreMin, setScoreMin] = useState<string>("");
  const [precioMax, setPrecioMax] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function recargar() {
    setLoading(true);
    try {
      const [a, l] = await Promise.all([getAlertas(), getWatchlist()]);
      setAlertas(a);
      setListas(l);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  async function onMarcarVista(id: number) {
    await marcarAlertaVista(id);
    setAlertas((prev) => prev.filter((a) => a.id !== id));
  }

  async function onCrear() {
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      const filtros: Filtros = {};
      if (tipo) filtros.tipo = tipo;
      if (zona) filtros.zona_id = Number(zona);
      if (scoreMin) filtros.score_min = Number(scoreMin);
      if (precioMax) filtros.precio_max = Number(precioMax) * 1e6;
      await crearWatchlist({ nombre: nombre.trim(), filtros_json: filtros, activa: true });
      setModal(false);
      setNombre("");
      setTipo("");
      setZona("");
      setScoreMin("");
      setPrecioMax("");
      await recargar();
    } finally {
      setSaving(false);
    }
  }

  async function onEliminar(id: number) {
    if (!confirm("¿Eliminar esta búsqueda guardada?")) return;
    await eliminarWatchlist(id);
    setListas((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <>
      <Header active="watchlist" />
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-h2 font-bold text-brand-800">
            Mis búsquedas guardadas
          </h1>
          <Button variant="amber" onClick={() => setModal(true)}>
            + Nueva búsqueda
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Alertas */}
            <section className="mb-10">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-h3 font-semibold text-brand-800">
                  Alertas recientes
                </h2>
                <Pill color="#c45c2a">{alertas.length} sin ver</Pill>
              </div>
              {alertas.length === 0 ? (
                <Card className="p-6 text-body-sm text-neutral-500">
                  No tienes alertas sin ver.
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {alertas.map((a) => (
                    <Card
                      key={a.id}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <ScoreBadge score={a.score} size={36} />
                        <div>
                          <p className="text-body-sm font-semibold text-neutral-800">
                            Oportunidad: {TIPO_LABEL[a.tipo] ?? a.tipo} en{" "}
                            {a.zona_nombre ?? "—"} · {formatCOP(a.precio)}
                          </p>
                          <p className="text-caption text-neutral-500">
                            Yield {formatPct(a.yield_bruto)} · Prob.{" "}
                            {a.prob_oportunidad != null
                              ? `${(a.prob_oportunidad * 100).toFixed(0)}%`
                              : "—"}{" "}
                            ·{" "}
                            <span
                              style={{
                                color: a.nivel_riesgo
                                  ? RIESGO_COLOR[a.nivel_riesgo]
                                  : undefined,
                              }}
                            >
                              riesgo {a.nivel_riesgo ?? "—"}
                            </span>{" "}
                            · {new Date(a.fecha).toLocaleDateString("es-CO")}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="outline"
                          className="px-3 py-1 text-caption"
                          onClick={() => router.push(`/inmueble/${a.inmueble_id}`)}
                        >
                          Ver
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-3 py-1 text-caption"
                          onClick={() => onMarcarVista(a.id)}
                        >
                          Marcar vista
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Búsquedas guardadas */}
            <section>
              <h2 className="mb-3 text-h3 font-semibold text-brand-800">
                Búsquedas guardadas
              </h2>
              {listas.length === 0 ? (
                <Card className="p-6 text-body-sm text-neutral-500">
                  Aún no has guardado búsquedas. Crea una con “Nueva búsqueda”.
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {listas.map((l) => (
                    <Card key={l.id} className="flex flex-col gap-3 p-5">
                      <div>
                        <h3 className="text-h4 font-semibold text-neutral-900">
                          {l.nombre}
                        </h3>
                        <p className="mt-1 text-body-sm text-neutral-500">
                          {filtrosLegibles(l.filtros_json)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          className="px-3 py-1.5 text-caption"
                          onClick={() =>
                            router.push(`/?${filtrosToQuery(l.filtros_json)}`)
                          }
                        >
                          Aplicar al mapa
                        </Button>
                        <Button
                          variant="outline"
                          className="px-3 py-1.5 text-caption text-terra-600"
                          onClick={() => onEliminar(l.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Modal nueva búsqueda */}
      <Dialog
        open={modal}
        onClose={() => setModal(false)}
        title="Nueva búsqueda guardada"
        maxWidth="max-w-lg"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-label uppercase text-neutral-500">
              Nombre
            </label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Aptos subvalorados Floridablanca"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-label uppercase text-neutral-500">
                Tipo
              </label>
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as "" | TipoInmueble)}>
                <option value="">Cualquiera</option>
                <option value="apto">Apartamento</option>
                <option value="casa">Casa</option>
                <option value="lote">Lote</option>
                <option value="local">Local</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-label uppercase text-neutral-500">
                Zona
              </label>
              <Select value={zona} onChange={(e) => setZona(e.target.value)}>
                <option value="">Cualquiera</option>
                {Object.entries(ZONAS).map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-label uppercase text-neutral-500">
                Score mínimo
              </label>
              <Input
                type="number"
                value={scoreMin}
                onChange={(e) => setScoreMin(e.target.value)}
                placeholder="70"
              />
            </div>
            <div>
              <label className="mb-1 block text-label uppercase text-neutral-500">
                Precio máx (millones)
              </label>
              <Input
                type="number"
                value={precioMax}
                onChange={(e) => setPrecioMax(e.target.value)}
                placeholder="400"
              />
            </div>
          </div>
          <Button variant="amber" onClick={onCrear} disabled={saving || !nombre.trim()}>
            {saving ? <Spinner className="h-4 w-4" /> : null}
            Guardar búsqueda
          </Button>
        </div>
      </Dialog>
    </>
  );
}
