import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { WatchlistService } from './watchlist.service';
import { CreateWatchlistDto } from './dto/create-watchlist.dto';

interface AuthedRequest {
  user: JwtPayload;
}

@ApiTags('watchlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Post()
  @ApiOperation({ summary: 'Guardar una búsqueda/criterios del usuario' })
  crear(@Req() req: AuthedRequest, @Body() dto: CreateWatchlistDto) {
    return this.watchlist.crear(req.user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar búsquedas guardadas del usuario' })
  listar(@Req() req: AuthedRequest) {
    return this.watchlist.listar(req.user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una búsqueda guardada' })
  eliminar(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.watchlist.eliminar(req.user.sub, id);
  }
}
