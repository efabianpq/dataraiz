import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OptimizarDto } from './dto/optimizar.dto';

const ANALYTICS_URL = process.env.ANALYTICS_URL ?? 'http://analytics:8000';

/**
 * Único punto donde el backend llama directamente a FastAPI: el frente de
 * Pareto (NSGA-II) se calcula bajo demanda y no está precalculado en la DB.
 */
@Injectable()
export class OptimizarService {
  private readonly logger = new Logger(OptimizarService.name);

  constructor(private readonly http: HttpService) {}

  async optimizar(dto: OptimizarDto): Promise<unknown> {
    try {
      const { data } = await firstValueFrom(
        this.http.post(`${ANALYTICS_URL}/analytics/optimizar`, dto, {
          timeout: 15000,
        }),
      );
      return data;
    } catch (err) {
      this.logger.error('Fallo al consultar el motor de optimización', err as Error);
      throw new InternalServerErrorException(
        'El motor de optimización (analytics) no respondió correctamente',
      );
    }
  }
}
