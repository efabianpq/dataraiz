import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateWatchlistDto {
  @ApiProperty({ example: 'Aptos subvalorados Floridablanca' })
  @IsString()
  nombre!: string;

  @ApiProperty({
    description: 'Criterios de filtro guardados',
    example: { tipo: 'apto', zona_id: 2, score_min: 70, precio_max: 400000000 },
  })
  @IsObject()
  filtros_json!: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
