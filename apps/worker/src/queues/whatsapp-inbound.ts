import { Worker, type Job } from "bullmq";
import type Redis from "ioredis";
import { getTenantDb, Prisma } from "@aif/db";
import { draftReply, isAiConfigured } from "@aif/ai";
import { isWhatsAppConfigured, missingWhatsAppEnvVars } from "@aif/whatsapp";
import { QUEUE_NAMES, enqueueWhatsAppOutbound, type WhatsAppInboundJob } from "@aif/queue";
import { createLogger, logNotConfigured } from "@aif/shared";

const logger = createLogger("worker:whatsapp-inbound");

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Processes one inbound WhatsApp text message: finds/creates the Customer
 * and an open Conversation, logs the message, then drafts and — unless
 * the AI escalated, or a human already has this conversation — sends an
 * automatic reply. This is the "communicate via WhatsApp" half of
 * MASTER_INSTRUCTIONS.md's business vision actually closing the loop:
 * real inbound message → AI grounded in real tenant data (packages/ai) →
 * real reply sent back (via the outbound queue) or handed to a human.
 */
export function startWhatsAppInboundWorker(connection: Redis): Worker<WhatsAppInboundJob> {
  return new Worker<WhatsAppInboundJob>(
    QUEUE_NAMES.whatsappInbound,
    async (job: Job<WhatsAppInboundJob>) => {
      const { tenantId, fromPhoneNumber, contactName, waMessageId, text } = job.data;
      const db = getTenantDb(tenantId);

      // Exact-match on phone only for Phase 8's baseline — no E.164
      // normalization/fuzzy matching, so a Customer entered with
      // different formatting than WhatsApp's own "from" field (digits
      // only, country code, no separators) won't be matched. Documented
      // as a known limitation in docs/BUILD_PROGRESS.md.
      let customer = await db.customer.findFirst({ where: { phone: fromPhoneNumber } });
      if (!customer) {
        customer = await db.customer.create({
          data: { tenantId, name: contactName ?? fromPhoneNumber, phone: fromPhoneNumber },
        });
      }

      let conversation = await db.conversation.findFirst({
        where: { customerId: customer.id, channel: "WHATSAPP", status: { not: "CLOSED" } },
        orderBy: { createdAt: "desc" },
      });
      if (!conversation) {
        conversation = await db.conversation.create({
          data: { tenantId, customerId: customer.id, channel: "WHATSAPP" },
        });
      }

      let message;
      try {
        message = await db.message.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            senderType: "CUSTOMER",
            body: text,
            externalId: waMessageId,
          },
        });
      } catch (err) {
        // The BullMQ jobId dedupe (see enqueueWhatsAppInbound) already
        // catches most redeliveries before they get here, but the
        // unique(tenantId, externalId) constraint is the real, final
        // guard — belt and suspenders for the same idempotency
        // requirement (MASTER_INSTRUCTIONS.md §4).
        if (isUniqueConstraintViolation(err)) {
          logger.info({ waMessageId }, "Duplicate inbound WhatsApp message — already processed, skipping");
          return;
        }
        throw err;
      }
      await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });

      if (conversation.status === "HUMAN_REQUIRED") {
        logger.info(
          { conversationId: conversation.id },
          "Conversation already escalated to a human — logging message, not auto-replying",
        );
        return;
      }

      if (!isAiConfigured()) {
        logNotConfigured(logger, "AI", ["ANTHROPIC_API_KEY (or OPENAI_API_KEY)"]);
        return;
      }

      const history = await db.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
      });

      const draft = await draftReply({
        tenantId,
        conversationId: conversation.id,
        history: history.map((m) => ({
          role: m.senderType === "CUSTOMER" ? ("user" as const) : ("assistant" as const),
          content: m.body,
        })),
      });

      if (draft.escalated) {
        logger.info({ conversationId: conversation.id }, "AI escalated this conversation — not auto-replying");
        return;
      }

      const aiMessage = await db.message.create({
        data: { tenantId, conversationId: conversation.id, senderType: "AI", body: draft.text },
      });
      await db.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: aiMessage.createdAt },
      });

      if (!isWhatsAppConfigured()) {
        logNotConfigured(logger, "WhatsApp", missingWhatsAppEnvVars());
        return;
      }

      await enqueueWhatsAppOutbound({
        tenantId,
        conversationId: conversation.id,
        messageId: aiMessage.id,
        toPhoneNumber: fromPhoneNumber,
        body: draft.text,
      });
    },
    { connection },
  );
}
