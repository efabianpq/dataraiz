const PILOT_CITIES = process.env.PILOT_CITIES ?? 'bucaramanga,floridablanca,giron,piedecuesta';
const INTERVAL_HOURS = Number(process.env.SCRAPING_INTERVAL_HOURS ?? 6);

console.log('DataRaíz scraper worker iniciado.');
console.log(`Ciudades piloto: ${PILOT_CITIES}`);
console.log(`Intervalo de scraping configurado: cada ${INTERVAL_HOURS}h`);
console.log('Aún no hay scrapers programados (pendiente: Fase 1A).');

setInterval(() => {
  console.log(`[${new Date().toISOString()}] Worker activo, en espera de tareas.`);
}, 60_000);
