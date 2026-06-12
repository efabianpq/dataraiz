import { Test, TestingModule } from '@nestjs/testing';
import { OptimizarController } from './optimizar.controller';
import { OptimizarService } from './optimizar.service';
import { OptimizarDto } from './dto/optimizar.dto';

describe('OptimizarController', () => {
  let controller: OptimizarController;
  let optimizar: { optimizar: jest.Mock };

  beforeEach(async () => {
    optimizar = { optimizar: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OptimizarController],
      providers: [{ provide: OptimizarService, useValue: optimizar }],
    }).compile();
    controller = module.get(OptimizarController);
  });

  it('POST /optimizar delega en el servicio proxy', () => {
    const dto: OptimizarDto = { presupuesto_max: 400000000, tipos: ['apto'] };
    optimizar.optimizar.mockReturnValueOnce({ frente: [] });
    controller.ejecutar(dto);
    expect(optimizar.optimizar).toHaveBeenCalledWith(dto);
  });
});
