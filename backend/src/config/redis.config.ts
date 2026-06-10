export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
}

/**
 * Convierte una REDIS_URL (redis://[:password@]host:port) en las opciones
 * de conexión que esperan BullMQ/ioredis.
 */
export function parseRedisUrl(url: string): RedisConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  };
}
