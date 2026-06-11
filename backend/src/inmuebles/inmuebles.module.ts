import { Module } from '@nestjs/common';
import { InmueblesController } from './inmuebles.controller';
import { InmueblesService } from './inmuebles.service';
import { ReporteService } from './reporte.service';

@Module({
  controllers: [InmueblesController],
  providers: [InmueblesService, ReporteService],
})
export class InmueblesModule {}
