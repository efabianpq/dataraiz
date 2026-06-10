import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScrapingController } from './scraping.controller';
import { ScrapingService } from './scraping.service';
import { SCRAPING_QUEUE } from './scraping.constants';

@Module({
  imports: [BullModule.registerQueue({ name: SCRAPING_QUEUE })],
  controllers: [ScrapingController],
  providers: [ScrapingService],
})
export class ScrapingModule {}
