import { Worker, Job, ConnectionOptions } from 'bullmq';
import { scrapeFincaraiz } from './fincaraiz';

export const SCRAPING_QUEUE_NAME = 'scraping';

function getConnectionOptions(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://redis:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Arranca el worker BullMQ que procesa jobs de scraping. Job soportado:
 * - name: 'fincaraiz', data: ScrapeOptions (opcional)
 */
export function startWorker(): Worker {
  const worker = new Worker(
    SCRAPING_QUEUE_NAME,
    async (job: Job) => {
      console.log(`[worker] procesando job ${job.id} (${job.name})`);
      switch (job.name) {
        case 'fincaraiz':
          return scrapeFincaraiz(job.data ?? {});
        default:
          throw new Error(`Job desconocido: ${job.name}`);
      }
    },
    { connection: getConnectionOptions(), concurrency: 1 },
  );

  worker.on('completed', (job, result) => {
    console.log(`[worker] job ${job.id} completado:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} fallido: ${err.message}`);
  });

  return worker;
}
