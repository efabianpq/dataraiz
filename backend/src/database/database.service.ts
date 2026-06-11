import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';

/**
 * Pool de conexiones a PostgreSQL/PostGIS. Expone un helper `query` tipado
 * que devuelve directamente las filas. El backend usa consultas SQL crudas
 * (sin ORM) porque solo lee datos geoespaciales precalculados.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://dataraiz:dataraiz_dev_password_2024@db:5432/dataraiz_db',
      max: 10,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('Conexión a PostgreSQL establecida');
    } catch (err) {
      this.logger.error('No se pudo conectar a PostgreSQL', err as Error);
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
