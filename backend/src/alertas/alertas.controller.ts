import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { AlertasService } from './alertas.service';

interface AuthedRequest {
  user: JwtPayload;
}

@ApiTags('alertas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get()
  @ApiOperation({ summary: 'Listar alertas no vistas del usuario' })
  listar(@Req() req: AuthedRequest) {
    return this.alertas.listarNoVistas(req.user.sub);
  }

  @Put(':id/vista')
  @ApiOperation({ summary: 'Marcar una alerta como vista' })
  marcarVista(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.alertas.marcarVista(req.user.sub, id);
  }
}
