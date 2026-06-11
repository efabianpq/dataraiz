import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AlertasService {
  constructor(private readonly db: DatabaseService) {}

  /** Alertas no vistas (estado != 'vista') con datos básicos del inmueble. */
  async listarNoVistas(usuarioId: number) {
    return this.db.query(
      `SELECT
         al.id,
         al.inmueble_id,
         al.fecha,
         al.estado,
         i.tipo,
         i.precio,
         a.score,
         a.prob_oportunidad,
         a.yield_bruto,
         a.nivel_riesgo,
         z.nombre AS zona_nombre
       FROM alerta al
       JOIN inmueble i ON i.id = al.inmueble_id
       LEFT JOIN analisis_inmueble a ON a.inmueble_id = i.id
       LEFT JOIN zona z ON z.id = a.zona_id
       WHERE al.usuario_id = $1 AND al.estado <> 'vista'
       ORDER BY al.fecha DESC`,
      [usuarioId],
    );
  }

  async marcarVista(usuarioId: number, id: number) {
    const rows = await this.db.query(
      `UPDATE alerta SET estado = 'vista'
        WHERE id = $1 AND usuario_id = $2
        RETURNING id, inmueble_id, estado, fecha`,
      [id, usuarioId],
    );
    if (!rows.length) {
      throw new NotFoundException(`Alerta ${id} no encontrada`);
    }
    return rows[0];
  }
}
