"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { InmuebleListItem } from "@/lib/types";
import {
  categoriaColor,
  formatCOP,
  scoreCategoria,
  SCORE_CATS,
  type ScoreCat,
} from "@/lib/format";
import { TIPO_LABEL } from "@/lib/types";
import { MAP_CENTER_LAT, MAP_CENTER_LNG, OSM_RASTER_STYLE } from "@/lib/mapStyle";

function webglDisponible(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export default function MapaInmuebles({
  inmuebles,
  onSelect,
  categorias,
  onToggleCategoria,
}: {
  inmuebles: InmuebleListItem[];
  onSelect: (id: number) => void;
  /** Categorías de score visibles en el mapa (verde/amarillo/rojo/gris). */
  categorias: Set<ScoreCat>;
  onToggleCategoria: (cat: ScoreCat) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // Conjunto vivo de categorías visibles para el render de marcadores.
  const categoriasRef = useRef(categorias);
  categoriasRef.current = categorias;
  const [fallo, setFallo] = useState<string | null>(null);

  // Conteo por categoría (para la leyenda).
  const conteo: Record<ScoreCat, number> = {
    verde: 0,
    amarillo: 0,
    rojo: 0,
    gris: 0,
  };
  inmuebles.forEach((i) => (conteo[scoreCategoria(i.score)] += 1));

  // Inicializa el mapa una sola vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!webglDisponible()) {
      setFallo(
        "Tu navegador no tiene WebGL disponible (requerido para el mapa). " +
          "Activa la aceleración por hardware en la configuración del navegador.",
      );
      return;
    }
    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_RASTER_STYLE,
        center: [MAP_CENTER_LNG, MAP_CENTER_LAT],
        zoom: 12,
      });
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.on("load", () => {
        map.resize();
        renderMarkers();
      });
      mapRef.current = map;
    } catch (e) {
      setFallo(`No se pudo inicializar el mapa: ${(e as Error).message}`);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderMarkers() {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const visibles = categoriasRef.current;
    const bounds = new maplibregl.LngLatBounds();
    let count = 0;

    inmuebles.forEach((inm) => {
      if (!visibles.has(scoreCategoria(inm.score))) return;
      if (inm.lat == null || inm.lng == null) return;
      const lat = Number(inm.lat);
      const lng = Number(inm.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (lat === 0 && lng === 0) return;

      const el = document.createElement("div");
      el.style.cssText = `width:18px;height:18px;border-radius:9999px;background:${categoriaColor(
        inm.score,
      )};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;`;

      const popup = new maplibregl.Popup({ offset: 14, closeButton: true }).setHTML(
        `<div style="font-family:var(--font-jakarta),sans-serif;min-width:160px">
           <div style="font-weight:700;color:#1b4d3e;font-size:15px">${formatCOP(inm.precio)}</div>
           <div style="font-size:12px;color:#5c5552;margin:2px 0">
             ${TIPO_LABEL[inm.tipo] ?? inm.tipo} · Score ${inm.score == null ? "—" : Math.round(inm.score)}
           </div>
           <button data-id="${inm.id}" class="dr-ver-detalle"
             style="margin-top:6px;background:#1b4d3e;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer">
             Ver detalle
           </button>
         </div>`,
      );
      popup.on("open", () => {
        const btn = document.querySelector<HTMLButtonElement>(
          `.dr-ver-detalle[data-id="${inm.id}"]`,
        );
        if (btn) btn.onclick = () => onSelectRef.current(inm.id);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([lng, lat]);
      count += 1;
    });

    if (count > 1) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    } else if (count === 1) {
      map.easeTo({ center: bounds.getCenter(), zoom: 14, duration: 0 });
    }
  }

  // Re-renderiza marcadores cuando cambian los inmuebles o las categorías visibles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) renderMarkers();
    else map.once("load", () => renderMarkers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inmuebles, categorias]);

  if (fallo) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-100 p-6 text-center text-body-sm text-terra-700">
        {fallo}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Leyenda / filtro de pines por color de score */}
      <div className="absolute left-3 bottom-3 z-10 rounded-xl bg-white/95 p-3 shadow-panel backdrop-blur-sm">
        <div className="mb-2 text-label uppercase tracking-wide text-neutral-500">
          Score del pin
        </div>
        <div className="flex flex-col gap-1.5">
          {SCORE_CATS.map((c) => {
            const activa = categorias.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onToggleCategoria(c.key)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-left text-body-sm transition-colors ${
                  activa ? "hover:bg-neutral-100" : "opacity-40 hover:opacity-70"
                }`}
                title={activa ? "Ocultar estos pines" : "Mostrar estos pines"}
              >
                <span
                  className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white shadow-pin"
                  style={{
                    backgroundColor: activa ? c.color : "transparent",
                    boxShadow: activa ? undefined : `inset 0 0 0 2px ${c.color}`,
                  }}
                />
                <span className="font-medium text-neutral-800">{c.label}</span>
                <span className="font-mono text-caption text-neutral-400">
                  {c.rango}
                </span>
                <span className="ml-auto pl-2 font-mono text-caption font-semibold text-neutral-600">
                  {conteo[c.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
