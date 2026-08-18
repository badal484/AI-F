import pino from "pino";

/**
 * Shared structured logger used by both apps/web and apps/worker so log
 * shape (and log aggregation queries) stay consistent across the
 * serverless UI and the long-running worker.
 */
export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
    transport:
      process.env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    base: {
      env: process.env.NODE_ENV ?? "development",
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;

/**
 * Logs that an integration (WhatsApp, Stripe, etc.) was skipped because its
 * credentials are not configured, instead of silently no-op'ing or faking
 * success. Per MASTER_INSTRUCTIONS.md §7 — no simulated external calls.
 */
export function logNotConfigured(logger: Logger, integration: string, missingEnvVars: string[]) {
  logger.warn(
    { integration, missingEnvVars },
    `${integration} is NOT CONFIGURED — skipping. Set: ${missingEnvVars.join(", ")}`,
  );
}
