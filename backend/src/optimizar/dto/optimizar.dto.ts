import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class OptimizarDto {
  @ApiPropertyOptional({ description: 'Presupuesto máximo (COP)' })
  @IsOptional()
  @IsNumber()
  presupuesto_max?: number;

  @ApiPropertyOptional({ type: [Number], description: 'Ids de zona' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  zona_ids?: number[];

  @ApiPropertyOptional({ type: [String], description: 'Tipos de inmueble' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tipos?: string[];

  @ApiPropertyOptional({
    enum: ['bajo', 'medio', 'alto'],
    default: 'alto',
    description: 'Tolerancia máxima al riesgo',
  })
  @IsOptional()
  @IsIn(['bajo', 'medio', 'alto'])
  tolerancia_riesgo?: string;
}
