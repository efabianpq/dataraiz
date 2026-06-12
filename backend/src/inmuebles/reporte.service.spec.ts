import { Test, TestingModule } from '@nestjs/testing';

// @react-pdf/renderer es ESM y ts-jest no transforma node_modules; se mockea
// para ejercitar la lógica de armado del documento (parseo de SHAP, ramas de
// color, helpers) de forma determinista. La generación real del PDF se valida
// end-to-end contra el servicio en ejecución (sección de performance/Fase 8).
const renderToBuffer = jest.fn(async () =>
  Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1200, 0x20)]),
);
jest.mock('@react-pdf/renderer', () => ({
  Document: 'Document',
  Page: 'Page',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (s: Record<string, unknown>) => s },
  renderToBuffer: (...args: unknown[]) => renderToBuffer(...args),
}));

// La importación debe ocurrir después del mock.
import { ReporteService } from './reporte.service';
import { InmueblesService } from './inmuebles.service';

describe('ReporteService', () => {
  let service: ReporteService;
  let inmuebles: { detalle: jest.Mock };

  const detalleBase = (over: Record<string, unknown> = {}) => ({
    id: 1,
    tipo: 'apto',
    precio: 250000000,
    area_m2: 60,
    habitaciones: 2,
    banos: 2,
    zona_nombre: 'Cabecera',
    valor_estimado: 240000000,
    brecha: -4.0,
    yield_bruto: 6.5,
    cap_rate: 5.0,
    nivel_riesgo: 'bajo',
    dist_pot_m: 1200,
    dist_centrocentro_m: 3400,
    score: 82,
    shap_json: JSON.stringify([
      { feature: 'area_m2', value: 60, impact: 0.4 },
      { feature: 'dist_centrocentro_m', value: 3400, impact: -0.2 },
    ]),
    comparables: [
      {
        tipo: 'apto',
        zona_nombre: 'Cabecera',
        precio_m2: 4100000,
        dif_precio_m2: -50000,
      },
    ],
    ...over,
  });

  beforeEach(async () => {
    renderToBuffer.mockClear();
    inmuebles = { detalle: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReporteService,
        { provide: InmueblesService, useValue: inmuebles },
      ],
    }).compile();
    service = module.get(ReporteService);
  });

  it('genera un Buffer PDF a partir de la ficha del inmueble', async () => {
    inmuebles.detalle.mockResolvedValueOnce(detalleBase());
    const pdf = await service.generarPdf(1);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(inmuebles.detalle).toHaveBeenCalledWith(1);
    expect(renderToBuffer).toHaveBeenCalledTimes(1);
    // Se renderiza un árbol de documento (elemento React).
    expect(renderToBuffer).toHaveBeenCalledWith(expect.objectContaining({}));
  });

  it('no falla con shap_json inválido ni con campos nulos', async () => {
    inmuebles.detalle.mockResolvedValueOnce(
      detalleBase({
        shap_json: 'no-es-json',
        score: null,
        valor_estimado: null,
        brecha: null,
        yield_bruto: null,
        cap_rate: null,
        nivel_riesgo: null,
        comparables: [],
      }),
    );
    const pdf = await service.generarPdf(1);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(renderToBuffer).toHaveBeenCalledTimes(1);
  });

  it('acepta shap_json ya parseado (array) además de string', async () => {
    inmuebles.detalle.mockResolvedValueOnce(
      detalleBase({
        shap_json: [{ feature: 'banos', value: 2, impact: 0.1 }],
      }),
    );
    const pdf = await service.generarPdf(1);
    expect(Buffer.isBuffer(pdf)).toBe(true);
  });
});
