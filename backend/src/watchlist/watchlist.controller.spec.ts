import { Test, TestingModule } from '@nestjs/testing';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';
import { CreateWatchlistDto } from './dto/create-watchlist.dto';

describe('WatchlistController', () => {
  let controller: WatchlistController;
  let watchlist: { crear: jest.Mock; listar: jest.Mock; eliminar: jest.Mock };
  const req = { user: { sub: 1, usuario: 'admin' } };

  beforeEach(async () => {
    watchlist = { crear: jest.fn(), listar: jest.fn(), eliminar: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WatchlistController],
      providers: [{ provide: WatchlistService, useValue: watchlist }],
    }).compile();
    controller = module.get(WatchlistController);
  });

  it('POST propaga el usuario autenticado y el DTO', () => {
    const dto = { nombre: 'x', filtros_json: {} } as CreateWatchlistDto;
    controller.crear(req, dto);
    expect(watchlist.crear).toHaveBeenCalledWith(1, dto);
  });

  it('GET lista por usuario autenticado', () => {
    controller.listar(req);
    expect(watchlist.listar).toHaveBeenCalledWith(1);
  });

  it('DELETE elimina por usuario e id', () => {
    controller.eliminar(req, 9);
    expect(watchlist.eliminar).toHaveBeenCalledWith(1, 9);
  });
});
