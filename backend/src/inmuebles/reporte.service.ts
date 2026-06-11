import { Injectable } from '@nestjs/common';
import { createElement as h } from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import { InmueblesService } from './inmuebles.service';

// Paleta de marca DataRaíz.
const BRAND = '#1B4D3E';
const AMBER = '#D4943A';
const TERRA = '#C45C2A';
const DATA = '#2563A8';
const NEUTRAL_700 = '#5C5552';
const NEUTRAL_300 = '#E2DDD9';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: '#1C1917', fontFamily: 'Helvetica' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 8,
    marginBottom: 16,
  },
  brand: { fontSize: 20, color: BRAND, fontFamily: 'Helvetica-Bold' },
  eyebrow: { fontSize: 8, color: NEUTRAL_700, textTransform: 'uppercase' },
  h2: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: BRAND,
    marginTop: 14,
    marginBottom: 6,
  },
  precio: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: BRAND },
  scoreBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Helvetica-Bold' },
  scoreLabel: { color: '#FFFFFF', fontSize: 7 },
  cardRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: NEUTRAL_300,
    borderRadius: 6,
    padding: 8,
  },
  cardLabel: { fontSize: 8, color: NEUTRAL_700, marginBottom: 3 },
  cardValue: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: NEUTRAL_300,
    paddingVertical: 3,
  },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NEUTRAL_700 },
  cell: { fontSize: 9 },
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 9,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: NEUTRAL_700,
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderTopColor: NEUTRAL_300,
    paddingTop: 6,
  },
});

const TIPO_LABEL: Record<string, string> = {
  apto: 'Apartamento',
  casa: 'Casa',
  lote: 'Lote',
  local: 'Local',
};

function scoreColor(score: number | null): string {
  if (score == null) return NEUTRAL_700;
  if (score >= 85) return '#3A9673';
  if (score >= 70) return DATA;
  if (score >= 50) return AMBER;
  return TERRA;
}

function riesgoColor(nivel: string | null): string {
  if (nivel === 'alto') return TERRA;
  if (nivel === 'medio') return AMBER;
  return '#3A9673';
}

const cop = (v: unknown): string =>
  v == null ? '—' : `$ ${Number(v).toLocaleString('es-CO')}`;
const pct = (v: unknown): string =>
  v == null ? '—' : `${Number(v).toFixed(2)} %`;

interface ShapItem {
  feature: string;
  value: number;
  impact: number;
}

@Injectable()
export class ReporteService {
  constructor(private readonly inmuebles: InmueblesService) {}

  async generarPdf(id: number): Promise<Buffer> {
    const d = await this.inmuebles.detalle(id);
    const score = d.score == null ? null : Number(d.score);
    const comparables = (d.comparables as Record<string, unknown>[]) ?? [];
    let shap: ShapItem[] = [];
    try {
      const raw = d.shap_json;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) shap = parsed as ShapItem[];
    } catch {
      shap = [];
    }
    const topShap = [...shap]
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 5);

    const doc = h(
      Document,
      null,
      h(
        Page,
        { size: 'A4', style: styles.page },
        // Header
        h(
          View,
          { style: styles.header },
          h(
            View,
            null,
            h(Text, { style: styles.brand }, 'DataRaíz'),
            h(
              Text,
              { style: styles.eyebrow },
              'Reporte de análisis de inversión inmobiliaria',
            ),
          ),
          h(Text, { style: styles.eyebrow }, `Inmueble #${id}`),
        ),
        // Resumen + score
        h(
          View,
          { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
          h(
            View,
            null,
            h(
              Text,
              { style: styles.eyebrow },
              `${TIPO_LABEL[String(d.tipo)] ?? d.tipo} · ${d.zona_nombre ?? 'Zona N/D'}`,
            ),
            h(Text, { style: styles.precio }, cop(d.precio)),
            h(
              Text,
              { style: { fontSize: 9, color: NEUTRAL_700 } },
              `${d.area_m2 ?? '—'} m² · ${d.habitaciones ?? '—'} hab · ${d.banos ?? '—'} baños`,
            ),
          ),
          h(
            View,
            { style: [styles.scoreBox, { backgroundColor: scoreColor(score) }] },
            h(Text, { style: styles.scoreText }, score == null ? 'N/D' : String(Math.round(score))),
            h(Text, { style: styles.scoreLabel }, 'SCORE'),
          ),
        ),
        // Análisis financiero
        h(Text, { style: styles.h2 }, 'Análisis financiero'),
        h(
          View,
          { style: styles.cardRow },
          this.card('Valor estimado (modelo)', cop(d.valor_estimado)),
          this.card(
            'Brecha vs estimado',
            d.brecha == null ? '—' : `${Number(d.brecha).toFixed(1)} %`,
            d.brecha == null ? undefined : Number(d.brecha) < 0 ? '#3A9673' : TERRA,
          ),
        ),
        h(
          View,
          { style: styles.cardRow },
          this.card(
            'Yield bruto',
            pct(d.yield_bruto),
            d.yield_bruto != null && Number(d.yield_bruto) > 6 ? '#3A9673' : undefined,
          ),
          this.card('Cap rate', pct(d.cap_rate)),
        ),
        // Riesgo territorial
        h(Text, { style: styles.h2 }, 'Nivel de riesgo territorial'),
        h(
          View,
          { style: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 } },
          h(
            Text,
            { style: [styles.pill, { backgroundColor: riesgoColor(String(d.nivel_riesgo)) }] },
            `Riesgo ${d.nivel_riesgo ?? 'N/D'}`,
          ),
          h(
            Text,
            { style: { fontSize: 9 } },
            `Dist. POT más cercano: ${d.dist_pot_m == null ? '—' : Math.round(Number(d.dist_pot_m)) + ' m'}  ·  Dist. centro: ${d.dist_centrocentro_m == null ? '—' : Math.round(Number(d.dist_centrocentro_m)) + ' m'}`,
          ),
        ),
        // SHAP
        h(Text, { style: styles.h2 }, '¿Por qué este score? (top 5 variables)'),
        topShap.length
          ? h(
              View,
              null,
              h(
                View,
                { style: styles.row },
                h(Text, { style: [styles.th, { flex: 3 }] }, 'Variable'),
                h(Text, { style: [styles.th, { flex: 1, textAlign: 'right' }] }, 'Impacto'),
              ),
              ...topShap.map((s, i) =>
                h(
                  View,
                  { key: String(i), style: styles.row },
                  h(Text, { style: [styles.cell, { flex: 3 }] }, s.feature),
                  h(
                    Text,
                    {
                      style: [
                        styles.cell,
                        { flex: 1, textAlign: 'right', color: s.impact >= 0 ? '#3A9673' : TERRA },
                      ],
                    },
                    `${s.impact >= 0 ? '+' : ''}${Number(s.impact).toFixed(3)}`,
                  ),
                ),
              ),
            )
          : h(Text, { style: styles.cell }, 'Sin datos SHAP disponibles para este inmueble.'),
        // Comparables
        h(Text, { style: styles.h2 }, 'Propiedades comparables'),
        h(
          View,
          { style: styles.row },
          h(Text, { style: [styles.th, { flex: 2 }] }, 'Tipo'),
          h(Text, { style: [styles.th, { flex: 2 }] }, 'Zona'),
          h(Text, { style: [styles.th, { flex: 2, textAlign: 'right' }] }, 'Precio/m²'),
          h(Text, { style: [styles.th, { flex: 2, textAlign: 'right' }] }, 'Dif. %'),
        ),
        ...comparables.map((c, i) =>
          h(
            View,
            { key: String(i), style: styles.row },
            h(Text, { style: [styles.cell, { flex: 2 }] }, TIPO_LABEL[String(c.tipo)] ?? String(c.tipo)),
            h(Text, { style: [styles.cell, { flex: 2 }] }, String(c.zona_nombre ?? '—')),
            h(Text, { style: [styles.cell, { flex: 2, textAlign: 'right' }] }, cop(c.precio_m2)),
            h(
              Text,
              { style: [styles.cell, { flex: 2, textAlign: 'right' }] },
              c.dif_precio_m2 == null ? '—' : cop(c.dif_precio_m2),
            ),
          ),
        ),
        h(
          Text,
          { style: styles.footer, fixed: true },
          `DataRaíz · Inteligencia territorial para la inversión inmobiliaria · Generado ${new Date().toLocaleDateString('es-CO')} · Los valores son estimaciones del modelo, no constituyen asesoría financiera.`,
        ),
      ),
    );

    return renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
  }

  private card(label: string, value: string, color?: string) {
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.cardLabel }, label),
      h(Text, { style: [styles.cardValue, color ? { color } : {}] }, value),
    );
  }
}
