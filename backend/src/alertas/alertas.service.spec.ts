import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AlertasService } from './alertas.service';
import { DatabaseService } from '../database/database.service';

describe('AlertasService', () => {
  let service: AlertasService;
  let db: { query: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AlertasService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(AlertasService);
  });

  it('listarNoVistas filtra por usuario y excluye estado vista', async () => {
    db.query.mockResolvedValueOnce([{ id: 1, estado: 'nueva' }]);
    const res = await service.listarNoVistas(7);
    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toContain("estado <> 'vista'");
    expect(db.query.mock.calls[0][1]).toEqual([7]);
    expect(res).toHaveLength(1);
  });

  it('marcarVista actualiza el estado y devuelve la fila', async () => {
    db.query.mockResolvedValueOnce([
      { id: 4, inmueble_id: 10, estado: 'vista' },
    ]);
    const res = await service.marcarVista(7, 4);
    expect(db.query.mock.calls[0][1]).toEqual([4, 7]); // id, usuario_id
    expect(res).toEqual({ id: 4, inmueble_id: 10, estado: 'vista' });
  });

  it('marcarVista lanza NotFound si la alerta no existe', async () => {
    db.query.mockResolvedValueOnce([]);
    await expect(service.marcarVista(7, 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
