import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ScrapingController } from './scraping.controller';
import { ScrapingService } from './scraping.service';
import { SCRAPING_QUEUE } from './scraping.constants';

describe('ScrapingController', () => {
  let controller: ScrapingController;
  let queue: { add: jest.Mock; getJob: jest.Mock };

  beforeEach(async () => {
    queue = {
      add: jest.fn().mockResolvedValue({ id: '123' }),
      getJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScrapingController],
      providers: [
        ScrapingService,
        { provide: getQueueToken(SCRAPING_QUEUE), useValue: queue },
      ],
    }).compile();

    controller = module.get<ScrapingController>(ScrapingController);
  });

  it('POST /scraping/run encola un job de fincaraiz', async () => {
    const result = await controller.run();
    expect(result).toEqual({ jobId: '123' });
    expect(queue.add).toHaveBeenCalledWith('fincaraiz', {}, expect.any(Object));
  });

  it('GET /scraping/status/:jobId retorna not_found si no existe', async () => {
    queue.getJob.mockResolvedValue(null);
    const result = await controller.status('does-not-exist');
    expect(result).toEqual({ jobId: 'does-not-exist', status: 'not_found' });
  });

  it('GET /scraping/status/:jobId retorna el estado del job', async () => {
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('completed'),
      returnvalue: { inserted: 5 },
      failedReason: undefined,
    });
    const result = await controller.status('123');
    expect(result).toEqual({
      jobId: '123',
      status: 'completed',
      result: { inserted: 5 },
      failedReason: undefined,
    });
  });
});
