import Redis from "ioredis";

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * Shared ioredis connection, reused by every BullMQ Queue/Worker registered
 * in later phases (Phase 8 WhatsApp, Phase 9 Automations, Phase 6 embedding
 * jobs, etc.) — BullMQ recommends one connection per process, not one per
 * queue.
 */
export function createRedisConnection(): Redis {
  if (!isRedisConfigured()) {
    throw new Error("Redis is NOT CONFIGURED — set REDIS_URL");
  }

  return new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null, // required by BullMQ
  });
}
