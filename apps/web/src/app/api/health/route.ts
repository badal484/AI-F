import { NextResponse } from "next/server";
import { getPlatformDb } from "@aif/db";
import { createLogger, logNotConfigured } from "@aif/shared";
import { isDatabaseConfigured, isSupabaseConfigured, missingSupabaseEnvVars } from "@/lib/env";

const logger = createLogger("web:health");

export async function GET() {
  const databaseConfigured = isDatabaseConfigured();
  let databaseReachable = false;
  let databaseError: string | undefined;

  if (databaseConfigured) {
    try {
      await getPlatformDb().$queryRaw`SELECT 1`;
      databaseReachable = true;
    } catch (err) {
      databaseError = err instanceof Error ? err.message : "Unknown database error";
      logger.error({ err }, "Health check: database unreachable");
    }
  } else {
    logNotConfigured(logger, "Database", ["DATABASE_URL"]);
  }

  const supabaseConfigured = isSupabaseConfigured();
  if (!supabaseConfigured) {
    logNotConfigured(logger, "Supabase Auth", missingSupabaseEnvVars());
  }

  const redisConfigured = Boolean(process.env.REDIS_URL);
  if (!redisConfigured) {
    logNotConfigured(logger, "Redis", ["REDIS_URL"]);
  }

  const status = databaseConfigured && !databaseReachable ? "degraded" : "ok";

  const body = {
    status,
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        configured: databaseConfigured,
        reachable: databaseConfigured ? databaseReachable : undefined,
        error: databaseError,
      },
      supabaseAuth: { configured: supabaseConfigured },
      redis: { configured: redisConfigured },
    },
  };

  return NextResponse.json(body, { status: status === "ok" ? 200 : 503 });
}
