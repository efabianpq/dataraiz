import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { SCRAPING_QUEUE } from './scraping.constants';

const SCRAPING_INTERVAL_HOURS = Number(
  process.env.SCRAPING_INTERVAL_HOURS ?? 6,
);
const SCHEDULE_CRON = `0 */${SCRAPING_INTERVAL_HOURS} * * *`;

export interface JobStatus {
  jobId: string;
  status: string;
  result?: unknown;
  failedReason?: string;
}

@Injectable()
export class ScrapingService {
  private readonly logger = new Logger(ScrapingService.name);

  constructor(@InjectQueue(SCRAPING_QUEUE) private readonly queue: Queue) {}

  async triggerFincaraiz(): Promise<{ jobId: string }> {
    const job = await this.queue.add(
      'fincaraiz',
      {},
      { removeOnComplete: 10, removeOnFail: 50 },
    );
    this.logger.log(`Job de scraping Fincaraíz encolado: ${job.id}`);
    return { jobId: String(job.id) };
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return { jobId, status: 'not_found' };
    }
    const status = await job.getState();
    return {
      jobId,
      status,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  @Cron(SCHEDULE_CRON, { name: 'fincaraiz-scraping' })
  async scheduledScrape(): Promise<void> {
    this.logger.log(
      `Disparando scraping programado de Fincaraíz (cada ${SCRAPING_INTERVAL_HOURS}h)`,
    );
    await this.triggerFincaraiz();
  }
}
