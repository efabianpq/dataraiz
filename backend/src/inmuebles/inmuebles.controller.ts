import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InmueblesService } from './inmuebles.service';
import { ReporteService } from './reporte.service';
import { ListarInmueblesDto } from './dto/listar-inmuebles.dto';

@ApiTags('inmuebles')
@Controller('inmuebles')
export class InmueblesController {
  constructor(
    private readonly inmuebles: InmueblesService,
    private readonly reporte: ReporteService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista paginada de inmuebles con filtros, ordenada por score DESC',
  })
  @ApiOkResponse({ description: 'Lista paginada de inmuebles con su análisis' })
  listar(@Query() query: ListarInmueblesDto) {
    return this.inmuebles.listar(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Ficha completa del inmueble: análisis, SHAP, comparables y zona',
  })
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.inmuebles.detalle(id);
  }

  @Get(':id/reporte')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Genera y descarga el PDF del análisis del inmueble' })
  async reportePdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const pdf = await this.reporte.generarPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dataraiz-inmueble-${id}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }
}
