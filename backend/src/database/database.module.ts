import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

/**
 * Módulo global de acceso a PostgreSQL. El backend SOLO lee resultados
 * precalculados (analisis_inmueble, comparable, zona) — nunca recalcula.
 * La escritura se limita a watchlist y alerta (estado del usuario).
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
