import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InmueblesService } from './inmuebles.service';
import { DatabaseService } from '../database/database.service';
import { ListarInmueblesDto } from './dto/listar-inmuebles.dto';

/**
 * Tests unitarios del servicio de inmuebles con la capa de datos mockeada.
 * Verifican la construcción de filtros SQL, la paginación, la coerción
 * numérica (node-postgres devuelve NUMERIC como string) y el manejo de 404.
 */
describe('InmueblesService', () => {
  let service: InmueblesService;
  let db: { query: jest.Mock };

  const base = (over: Partial<ListarInmueblesDto> = {}): ListarInmueblesDto =>
    ({ page: 1, limit: 20, ...over }) as ListarInmueblesDto;

  beforeEach(async () => {
    db = { query: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InmueblesService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();
    service = module.get(InmueblesService);
  });

  describe('listar', () => {
    it('sin filtros: no arma WHERE y pagina con valores por defecto', async () => {
      db.query
        .mockResolvedValueOnce([{ total: '40' }]) // count
        .mockResolvedValueOnce([]); // data

      const res = await service.listar(base());

      const countSql = db.query.mock.calls[0][0] as string;
      const countParams = db.query.mock.calls[0][1] as unknown[];
      expect(countSql).not.toContain('WHERE');
      expect(countParams).toEqual([]);

      // La query de datos añade LIMIT y OFFSET al final.
      const dataParams = db.query.mock.calls[1][1] as unknown[];
      expect(dataParams).toEqual([20, 0]);

      expect(res.total).toBe(40);
      expect(res.total_pages).toBe(2);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
    });

    it('arma cláusulas y parámetros en orden para cada filtro', async () => {
      db.query.mockResolvedValueOnce([{ total: '5' }]).mockResolvedValueOnce([]);

      await service.listar(
        base({
          precio_min: 100,
          precio_max: 900,
          tipo: 'apto' as ListarInmueblesDto['tipo'],
          zona_id: 2,
          score_min: 70,
          page: 2,
          limit: 10,
        }),
      );

      const whereSql = db.query.mock.calls[0][0] as string;
      const countParams = db.query.mock.calls[0][1] as unknown[];
      expect(whereSql).toContain('WHERE');
      expect(whereSql).toContain('i.precio >= $1');
      expect(whereSql).toContain('i.precio <= $2');
      expect(whereSql).toContain('i.tipo = $3');
      expect(whereSql).toContain('a.zona_id = $4');
      expect(whereSql).toContain('a.score >= $5');
      expect(countParams).toEqual([100, 900, 'apto', 2, 70]);

      // offset = (page-1)*limit = 10
      const dataParams = db.query.mock.calls[1][1] as unknown[];
      expect(dataParams).toEqual([100, 900, 'apto', 2, 70, 10, 10]);
    });

    it('nivel_riesgo se traduce a rango numérico (medio = 2)', async () => {
      db.query.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);
      await service.listar(
        base({ nivel_riesgo: 'medio' as ListarInmueblesDto['nivel_riesgo'] }),
      );
      const countParams = db.query.mock.calls[0][1] as unknown[];
      expect(countParams).toEqual([2]);
    });

    it('castNumbers convierte strings NUMERIC a number', async () => {
      db.query.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([
        {
          id: 1,
          tipo: 'apto',
          precio: '250000000',
          area_m2: '60',
          habitaciones: 2,
          lat: '7.1',
          lng: '-73.1',
          score: '82.5',
          prob_oportunidad: '0.9',
          yield_bruto: '6.1',
          cap_rate: '5.0',
          nivel_riesgo: 'bajo',
          zona_id: 2,
        },
      ]);

      const res = await service.listar(base());
      const row = res.data[0];
      expect(row.precio).toBe(250000000);
      expect(row.score).toBe(82.5);
      expect(row.lat).toBeCloseTo(7.1);
      expect(typeof row.precio).toBe('number');
    });

    it('total_pages es al menos 1 aunque no haya resultados', async () => {
      db.query.mockResolvedValueOnce([{ total: '0' }]).mockResolvedValueOnce([]);
      const res = await service.listar(base());
      expect(res.total_pages).toBe(1);
    });
  });

  describe('detalle', () => {
    it('lanza NotFound cuando el inmueble no existe', async () => {
      db.query.mockResolvedValueOnce([]); // sin filas
      await expect(service.detalle(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('devuelve el inmueble con comparables y coerción numérica', async () => {
      db.query
        .mockResolvedValueOnce([
          {
            id: 1,
            tipo: 'apto',
            precio: '250000000',
            area_m2: '60',
            valor_estimado: '240000000',
            brecha: '-4.0',
            score: '82.5',
            shap_json: '[]',
            zona_nombre: 'Cabecera',
          },
        ])
        .mockResolvedValueOnce([
          {
            comparable_id: '7',
            distancia_pca: '0.3',
            dif_precio_m2: '-50000',
            precio: '240000000',
            area_m2: '58',
            score: '80',
          },
        ]);

      const res = await service.detalle(1);
      expect(res.id).toBe(1);
      expect(res.precio).toBe(250000000);
      expect(res.valor_estimado).toBe(240000000);
      const comps = res.comparables as Record<string, unknown>[];
      expect(comps).toHaveLength(1);
      expect(comps[0].comparable_id).toBe(7);
      expect(comps[0].precio).toBe(240000000);
      // El id del inmueble se pasa como parámetro a ambas queries.
      expect(db.query.mock.calls[0][1]).toEqual([1]);
      expect(db.query.mock.calls[1][1]).toEqual([1]);
    });
  });
});
