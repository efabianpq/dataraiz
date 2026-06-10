import { startWorker, SCRAPING_QUEUE_NAME } from './queue';

const PILOT_CITIES = process.env.PILOT_CITIES ?? 'bucaramanga,floridablanca,giron,piedecuesta';

console.log('DataRaíz scraper worker iniciado.');
console.log(`Ciudades piloto: ${PILOT_CITIES}`);
console.log(`Escuchando cola BullMQ: "${SCRAPING_QUEUE_NAME}"`);

const worker = startWorker();

async function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando worker...`);
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
