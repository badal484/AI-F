import { createLogger, logNotConfigured } from "@aif/shared";
import { createRedisConnection, isRedisConfigured } from "./redis";

const logger = createLogger("worker");

async function main() {
  if (!isRedisConfigured()) {
    logNotConfigured(logger, "Redis", ["REDIS_URL"]);
    logger.warn("No queues can be registered without Redis. Worker will idle.");
  }

  const connection = isRedisConfigured() ? createRedisConnection() : null;

  if (connection) {
    try {
      await connection.ping();
      logger.info("Connected to Redis");
    } catch (err) {
      logger.error({ err }, "Failed to connect to Redis");
    }
  }

  // Phase 1 (Foundation) registers no queues yet — BullMQ Queue/Worker
  // instances are added starting Phase 8 (WhatsApp) and Phase 9
  // (Automations), reusing `connection` above. This heartbeat keeps the
  // process alive as the long-running worker it will become.
  logger.info("Worker foundation ready — no queues registered yet");
  const heartbeat = setInterval(() => logger.debug("heartbeat"), 60_000);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down worker");
    clearInterval(heartbeat);
    if (connection) {
      await connection.quit();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Worker crashed during startup");
  process.exit(1);
});
