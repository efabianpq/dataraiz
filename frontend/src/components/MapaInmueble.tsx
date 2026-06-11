"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { scoreColor } from "@/lib/format";
import { OSM_RASTER_STYLE } from "@/lib/mapStyle";

export default function MapaInmueble({
  lat,
  lng,
  score,
}: {
  lat: number;
  lng: number;
  score: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const safeLng = Number(lng);
    const safeLat = Number(lat);
    if (!Number.isFinite(safeLng) || !Number.isFinite(safeLat)) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: [safeLng, safeLat],
      zoom: 14,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    const el = document.createElement("div");
    el.style.cssText = `width:22px;height:22px;border-radius:9999px;background:${scoreColor(
      score,
    )};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);`;
    new maplibregl.Marker({ element: el }).setLngLat([safeLng, safeLat]).addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, score]);

  return <div ref={containerRef} className="h-full w-full rounded-xl" />;
}
