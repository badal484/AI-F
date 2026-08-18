import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * Lazily constructs the base, unscoped Prisma client on first use (not at
 * module import time) so importing this module never fails just because
 * DATABASE_URL isn't set yet — callers are expected to check
 * isDatabaseConfigured() before triggering a query, per the "NOT
 * CONFIGURED" logging discipline in MASTER_INSTRUCTIONS.md §7.
 *
 * Never import this directly in application code — go through
 * getTenantDb() or getPlatformDb() from ./tenant so tenant isolation
 * cannot be bypassed by accident.
 */
export function getBasePrisma(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}
