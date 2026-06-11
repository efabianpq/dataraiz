import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export enum TipoInmueble {
  apto = 'apto',
  casa = 'casa',
  lote = 'lote',
  local = 'local',
}

export enum NivelRiesgo {
  bajo = 'bajo',
  medio = 'medio',
  alto = 'alto',
}

export class ListarInmueblesDto {
  @ApiPropertyOptional({ description: 'Precio mínimo (COP)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  precio_min?: number;

  @ApiPropertyOptional({ description: 'Precio máximo (COP)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  precio_max?: number;

  @ApiPropertyOptional({ enum: TipoInmueble })
  @IsOptional()
  @IsEnum(TipoInmueble)
  tipo?: TipoInmueble;

  @ApiPropertyOptional({ description: 'Id de zona (1-4)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  zona_id?: number;

  @ApiPropertyOptional({ description: 'Score mínimo (0-100)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  score_min?: number;

  @ApiPropertyOptional({
    enum: NivelRiesgo,
    description: 'Nivel de riesgo máximo aceptado',
  })
  @IsOptional()
  @IsEnum(NivelRiesgo)
  nivel_riesgo?: NivelRiesgo;

  @ApiPropertyOptional({ default: 1, description: 'Página (1-indexada)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    default: 20,
    description:
      'Resultados por página. El dashboard pide un set amplio (hasta 1000) ' +
      'para alimentar el mapa con todos los inmuebles que cumplen los filtros.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 20;
}
