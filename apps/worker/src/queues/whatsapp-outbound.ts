import { Worker, type Job } from "bullmq";
import type Redis from "ioredis";
import { getTenantDb } from "@aif/db";
import { sendTextMessage, isWhatsAppConfigured, missingWhatsAppEnvVars } from "@aif/whatsapp";
import { QUEUE_NAMES, type WhatsAppOutboundJob } from "@aif/queue";
import { createLogger, logNotConfigured } from "@aif/shared";

const logger = createLogger("worker:whatsapp-outbound");

/**
 * The single place that actually calls the WhatsApp API to send a
 * message — both staff-composed replies (apps/web's sendMessage action)
 * and AI-drafted auto-replies (whatsapp-inbound.ts) enqueue here rather
 * than calling sendTextMessage themselves, so retry/rate-limit behavior
 * only needs to live in one place.
 */
export function startWhatsAppOutboundWorker(connection: Redis): Worker<WhatsAppOutboundJob> {
  return new Worker<WhatsAppOutboundJob>(
    QUEUE_NAMES.whatsappOutbound,
    async (job: Job<WhatsAppOutboundJob>) => {
      const { tenantId, toPhoneNumber, body, messageId } = job.data;

      if (!isWhatsAppConfigured()) {
        logNotConfigured(logger, "WhatsApp", missingWhatsAppEnvVars());
        return;
      }

      const db = getTenantDb(tenantId);
      const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant?.whatsappPhoneNumberId) {
        logger.error(
          { tenantId, messageId },
          "Tenant has no whatsappPhoneNumberId configured — cannot send",
        );
        return;
      }

      // BullMQ's configured retries (see enqueueWhatsAppOutbound) will
      // retry this on failure, including the case where Meta rejects a
      // free-form send because the customer's 24-hour window has closed
      // — that specific failure won't be fixed by retrying, but without
      // live credentials to see Meta's actual error shape for it, adding
      // special-case handling would be guessing. Revisit once this runs
      // against a real WhatsApp Business Account.
      const result = await sendTextMessage(tenant.whatsappPhoneNumberId, toPhoneNumber, body);
      logger.info({ messageId, waMessageId: result.id }, "Sent WhatsApp message");
    },
    { connection },
  );
}
