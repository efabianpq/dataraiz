"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ShapItem } from "@/lib/types";

// Etiquetas legibles en español para las features del modelo de valor.
const FEATURE_LABEL: Record<string, string> = {
  area_m2: "Área (m²)",
  habitaciones: "Habitaciones",
  banos: "Baños",
  dist_centrocentro_m: "Distancia al centro",
  dist_pot_m: "Distancia a proyecto POT",
  tipo_encoded: "Tipo de inmueble",
  nivel_riesgo_encoded: "Nivel de riesgo",
};

export function ShapChart({ shap }: { shap: ShapItem[] }) {
  const top = [...shap]
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 8);

  const maxAbs = Math.max(...top.map((s) => Math.abs(s.impact)), 0.0001);
  const data = top
    .map((s) => ({
      name: FEATURE_LABEL[s.feature] ?? s.feature,
      impact: s.impact,
      norm: s.impact / maxAbs,
    }))
    .reverse(); // mayor impacto arriba

  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 38)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 40, left: 20, bottom: 8 }}
      >
        <XAxis
          type="number"
          domain={[-1, 1]}
          tick={{ fontSize: 11, fill: "#79716e" }}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 12, fill: "#403b38" }}
        />
        <ReferenceLine x={0} stroke="#c4bebb" />
        <Tooltip
          formatter={(v) => [Number(v).toFixed(3), "Impacto"]}
          labelStyle={{ color: "#1b4d3e", fontWeight: 600 }}
        />
        <Bar dataKey="norm" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.impact >= 0 ? "#3a9673" : "#c45c2a"} />
          ))}
          <LabelList
            dataKey="impact"
            position="right"
            formatter={(v) => {
              const n = Number(v);
              return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
            }}
            style={{ fontSize: 11, fill: "#5c5552" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
