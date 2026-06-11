import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateWatchlistDto } from './dto/create-watchlist.dto';

@Injectable()
export class WatchlistService {
  constructor(private readonly db: DatabaseService) {}

  async crear(usuarioId: number, dto: CreateWatchlistDto) {
    const rows = await this.db.query(
      `INSERT INTO watchlist (usuario_id, nombre, filtros_json, activa)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, usuario_id, nombre, filtros_json, activa, created_at`,
      [
        usuarioId,
        dto.nombre,
        JSON.stringify(dto.filtros_json ?? {}),
        dto.activa ?? true,
      ],
    );
    return rows[0];
  }

  async listar(usuarioId: number) {
    return this.db.query(
      `SELECT id, usuario_id, nombre, filtros_json, activa, created_at
         FROM watchlist
        WHERE usuario_id = $1
        ORDER BY created_at DESC`,
      [usuarioId],
    );
  }

  async eliminar(usuarioId: number, id: number): Promise<{ deleted: number }> {
    const rows = await this.db.query<{ id: number }>(
      `DELETE FROM watchlist WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [id, usuarioId],
    );
    if (!rows.length) {
      throw new NotFoundException(`Búsqueda guardada ${id} no encontrada`);
    }
    return { deleted: rows[0].id };
  }
}
