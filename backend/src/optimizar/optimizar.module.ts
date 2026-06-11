import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OptimizarController } from './optimizar.controller';
import { OptimizarService } from './optimizar.service';

@Module({
  imports: [HttpModule],
  controllers: [OptimizarController],
  providers: [OptimizarService],
})
export class OptimizarModule {}
