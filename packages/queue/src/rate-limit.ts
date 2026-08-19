import { createRedisConnection, isRedisConfigured } from "./connection";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Fixed-window rate limiter backed by Redis (INCR + EXPIRE on a
 * request-scoped key). Built for public, unauthenticated endpoints where
 * a request that passes every other check (origin validation, a webhook
 * signature) still does real, cost-incurring work — an AI call, a DB
 * write — so unlimited volume is itself an abuse/cost vector distinct
 * from "is this request legitimate at all" (Phase 14, "Security
 * Hardening").
 *
 * If Redis is NOT CONFIGURED, returns `{ allowed: true, remaining: limit
 * }` — rate limiting degrades to "not enforced" rather than blocking the
 * request outright, the same NOT-CONFIGURED-skips-that-feature pattern
 * every other integration in this app follows. The endpoint's other
 * checks (origin/signature) remain the actual admission control either
 * way; this is defense-in-depth on top, not the only line of defense.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  if (!isRedisConfigured()) {
    return { allowed: true, remaining: limit };
  }

  const connection = createRedisConnection();
  try {
    const redisKey = `ratelimit:${key}`;
    const count = await connection.incr(redisKey);
    if (count === 1) {
      // Only the request that actually created the key sets its
      // expiry — avoids resetting the window on every increment, which
      // would let a sustained-but-under-limit caller keep the window
      // open forever.
      await connection.expire(redisKey, windowSeconds);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } finally {
    await connection.quit();
  }
}
