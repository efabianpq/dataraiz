import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';

// reporte.service.ts (importado transitivamente por el controlador) carga
// @react-pdf/renderer, que es ESM y ts-jest no transforma; se mockea aquí para
// que el módulo pueda importarse. El servicio real se reemplaza por un mock.
jest.mock('@react-pdf/renderer', () => ({
  Document: 'Document',
  Page: 'Page',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (s: Record<string, unknown>) => s },
  renderToBuffer: jest.fn(),
}));

import { InmueblesController } from './inmuebles.controller';
import { InmueblesService } from './inmuebles.service';
import { ReporteService } from './reporte.service';
import { ListarInmueblesDto } from './dto/listar-inmuebles.dto';

describe('InmueblesController', () => {
  let controller: InmueblesController;
  let inmuebles: { listar: jest.Mock; detalle: jest.Mock };
  let reporte: { generarPdf: jest.Mock };

  beforeEach(async () => {
    inmuebles = { listar: jest.fn(), detalle: jest.fn() };
    reporte = { generarPdf: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InmueblesController],
      providers: [
        { provide: InmueblesService, useValue: inmuebles },
        { provide: ReporteService, useValue: reporte },
      ],
    }).compile();
    controller = module.get(InmueblesController);
  });

  it('GET /inmuebles delega en el servicio', async () => {
    const query = { page: 1, limit: 20 } as ListarInmueblesDto;
    inmuebles.listar.mockResolvedValueOnce({ data: [], total: 0 });
    await controller.listar(query);
    expect(inmuebles.listar).toHaveBeenCalledWith(query);
  });

  it('GET /inmuebles/:id devuelve la ficha', async () => {
    inmuebles.detalle.mockResolvedValueOnce({ id: 3 });
    const res = await controller.detalle(3);
    expect(res).toEqual({ id: 3 });
    expect(inmuebles.detalle).toHaveBeenCalledWith(3);
  });

  it('GET /inmuebles/:id/reporte fija cabeceras PDF y envía el buffer', async () => {
    const pdf = Buffer.from('%PDF-1.4 contenido');
    reporte.generarPdf.mockResolvedValueOnce(pdf);
    const set = jest.fn();
    const end = jest.fn();
    const res = { set, end } as unknown as Response;

    await controller.reportePdf(7, res);

    expect(reporte.generarPdf).toHaveBeenCalledWith(7);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="dataraiz-inmueble-7.pdf"',
        'Content-Length': pdf.length,
      }),
    );
    expect(end).toHaveBeenCalledWith(pdf);
  });
});
