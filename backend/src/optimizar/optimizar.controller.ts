import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptimizarService } from './optimizar.service';
import { OptimizarDto } from './dto/optimizar.dto';

@ApiTags('optimizar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('optimizar')
export class OptimizarController {
  constructor(private readonly optimizar: OptimizarService) {}

  @Post()
  @ApiOperation({
    summary: 'Frente de Pareto (NSGA-II) — proxy al motor analytics (FastAPI)',
  })
  ejecutar(@Body() dto: OptimizarDto) {
    return this.optimizar.optimizar(dto);
  }
}
