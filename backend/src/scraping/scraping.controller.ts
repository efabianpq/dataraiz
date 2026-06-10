import { Controller, Get, Param, Post } from '@nestjs/common';
import { JobStatus, ScrapingService } from './scraping.service';

@Controller('scraping')
export class ScrapingController {
  constructor(private readonly scrapingService: ScrapingService) {}

  @Post('run')
  async run(): Promise<{ jobId: string }> {
    return this.scrapingService.triggerFincaraiz();
  }

  @Get('status/:jobId')
  async status(@Param('jobId') jobId: string): Promise<JobStatus> {
    return this.scrapingService.getJobStatus(jobId);
  }
}
