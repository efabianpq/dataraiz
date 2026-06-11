import type { StyleSpecification } from "maplibre-gl";

/**
 * Estilo raster de OpenStreetMap inline. A diferencia de los estilos vectoriales
 * (openfreemap/demotiles), no depende de un servidor de estilos: solo consume
 * los tiles raster públicos de OSM, que son muy confiables y gratuitos. Esto
 * garantiza que el mapa (y por tanto los pines) siempre se rendericen.
 */
export const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export const MAP_CENTER_LNG = Number(
  process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? -73.1227,
);
export const MAP_CENTER_LAT = Number(
  process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? 7.1197,
);
