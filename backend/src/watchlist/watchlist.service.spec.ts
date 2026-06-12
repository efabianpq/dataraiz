import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { DatabaseService } from '../database/database.service';
import { CreateWatchlistDto } from './dto/create-watchlist.dto';

describe('WatchlistService', () => {
  let service: WatchlistService;
  let db: { query: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchlistService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();
    service = module.get(WatchlistService);
  });

  it('crear serializa filtros_json y aplica defaults (activa=true)', async () => {
    const dto: CreateWatchlistDto = {
      nombre: 'Aptos baratos',
      filtros_json: { tipo: 'apto', precio_max: 300000000 },
    };
    db.query.mockResolvedValueOnce([{ id: 1, nombre: dto.nombre }]);

    const res = await service.crear(5, dto);

    const params = db.query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe(5); // usuario_id
    expect(params[1]).toBe('Aptos baratos');
    expect(params[2]).toBe(JSON.stringify(dto.filtros_json)); // jsonb string
    expect(params[3]).toBe(true); // activa default
    expect(res).toEqual({ id: 1, nombre: 'Aptos baratos' });
  });

  it('crear usa objeto vacío si filtros_json es undefined', async () => {
    db.query.mockResolvedValueOnce([{ id: 2 }]);
    await service.crear(5, {
      nombre: 'x',
    } as unknown as CreateWatchlistDto);
    const params = db.query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe('{}');
  });

  it('listar filtra por usuario_id', async () => {
    db.query.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    const res = await service.listar(5);
    expect(db.query.mock.calls[0][1]).toEqual([5]);
    expect(res).toHaveLength(2);
  });

  it('eliminar devuelve el id borrado', async () => {
    db.query.mockResolvedValueOnce([{ id: 3 }]);
    const res = await service.eliminar(5, 3);
    expect(db.query.mock.calls[0][1]).toEqual([3, 5]); // id, usuario_id
    expect(res).toEqual({ deleted: 3 });
  });

  it('eliminar lanza NotFound si no existe o no pertenece al usuario', async () => {
    db.query.mockResolvedValueOnce([]);
    await expect(service.eliminar(5, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
