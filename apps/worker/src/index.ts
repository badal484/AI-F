import type { Worker } from "bullmq";
import { createLogger, logNotConfigured } from "@aif/shared";
import { createRedisConnection, isRedisConfigured } from "@aif/queue";
import { startWhatsAppInboundWorker } from "./queues/whatsapp-inbound";
import { startWhatsAppOutboundWorker } from "./queues/whatsapp-outbound";

const logger = createLogger("worker");

async function main() {
  if (!isRedisConfigured()) {
    logNotConfigured(logger, "Redis", ["REDIS_URL"]);
    logger.warn("No queues can be registered without Redis. Worker will idle.");
  }

  const connection = isRedisConfigured() ? createRedisConnection() : null;
  const workers: Worker[] = [];

  if (connection) {
    try {
      await connection.ping();
      logger.info("Connected to Redis");

      workers.push(startWhatsAppInboundWorker(connection));
      workers.push(startWhatsAppOutboundWorker(connection));
      logger.info({ queues: workers.length }, "Registered BullMQ workers");
    } catch (err) {
      logger.error({ err }, "Failed to connect to Redis — queues will not run");
    }
  } else {
    logger.warn("Worker foundation ready — no queues registered (Redis NOT CONFIGURED)");
  }

  const heartbeat = setInterval(() => logger.debug("heartbeat"), 60_000);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down worker");
    clearInterval(heartbeat);
    await Promise.all(workers.map((w) => w.close()));
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
