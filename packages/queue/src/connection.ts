import Redis from "ioredis";

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * Shared ioredis connection factory. BullMQ recommends one connection per
 * process, not one per queue/worker — apps/worker creates exactly one and
 * passes it to every Queue/Worker it registers; apps/web creates its own
 * (short-lived, per serverless invocation) when it needs to enqueue a job.
 */
export function createRedisConnection(): Redis {
  if (!isRedisConfigured()) {
    throw new Error("Redis is NOT CONFIGURED — set REDIS_URL");
  }

  return new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null, // required by BullMQ
  });
}
