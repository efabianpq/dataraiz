import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { parseRedisUrl } from './config/redis.config';
import { HealthModule } from './health/health.module';
import { ScrapingModule } from './scraping/scraping.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { InmueblesModule } from './inmuebles/inmuebles.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { AlertasModule } from './alertas/alertas.module';
import { OptimizarModule } from './optimizar/optimizar.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: parseRedisUrl(process.env.REDIS_URL ?? 'redis://redis:6379'),
    }),
    DatabaseModule,
    HealthModule,
    ScrapingModule,
    AuthModule,
    InmueblesModule,
    WatchlistModule,
    AlertasModule,
    OptimizarModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
