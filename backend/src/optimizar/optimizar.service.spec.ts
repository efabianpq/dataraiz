import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { OptimizarService } from './optimizar.service';
import { OptimizarDto } from './dto/optimizar.dto';

/**
 * El servicio de optimización es el único proxy del backend al motor FastAPI
 * (NSGA-II no está precalculado). Se mockea HttpService.
 */
describe('OptimizarService', () => {
  let service: OptimizarService;
  let http: { post: jest.Mock };

  beforeEach(async () => {
    http = { post: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [OptimizarService, { provide: HttpService, useValue: http }],
    }).compile();
    service = module.get(OptimizarService);
  });

  it('reenvía el DTO al motor analytics y devuelve su payload', async () => {
    const frente = { frente: [{ inmueble_id: 1, yield_bruto: 6.2 }] };
    http.post.mockReturnValueOnce(of({ data: frente }));

    const dto: OptimizarDto = { presupuesto_max: 500000000, zona_ids: [2] };
    const res = await service.optimizar(dto);

    expect(res).toEqual(frente);
    const [url, body] = http.post.mock.calls[0];
    expect(url).toContain('/analytics/optimizar');
    expect(body).toBe(dto);
  });

  it('traduce un fallo del motor a InternalServerError', async () => {
    http.post.mockReturnValueOnce(
      throwError(() => new Error('ECONNREFUSED')),
    );
    await expect(service.optimizar({})).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
