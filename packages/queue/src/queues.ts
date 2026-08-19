import { Queue } from "bullmq";
import { z } from "zod";
import { createRedisConnection } from "./connection";

export const QUEUE_NAMES = {
  whatsappInbound: "whatsapp-inbound",
  whatsappOutbound: "whatsapp-outbound",
} as const;

export const whatsappInboundJobSchema = z.object({
  tenantId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  fromPhoneNumber: z.string().min(1),
  contactName: z.string().optional(),
  waMessageId: z.string().min(1),
  text: z.string().min(1),
  /** Meta sends this as unix seconds; kept as a string to round-trip through the job payload untouched. */
  timestamp: z.string().min(1),
});
export type WhatsAppInboundJob = z.infer<typeof whatsappInboundJobSchema>;

export const whatsappOutboundJobSchema = z.object({
  tenantId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  toPhoneNumber: z.string().min(1),
  body: z.string().min(1),
});
export type WhatsAppOutboundJob = z.infer<typeof whatsappOutboundJobSchema>;

/**
 * Enqueues an inbound WhatsApp webhook event for apps/worker to process.
 * jobId is the Meta message id itself — BullMQ won't add a second job with
 * an id that already exists (queued, active, or still within the
 * completed/failed retention window), which is exactly the idempotency
 * guard a webhook consumer needs, since Meta can redeliver the same event.
 */
export async function enqueueWhatsAppInbound(payload: WhatsAppInboundJob): Promise<void> {
  const parsed = whatsappInboundJobSchema.parse(payload);
  const connection = createRedisConnection();
  try {
    const queue = new Queue(QUEUE_NAMES.whatsappInbound, { connection });
    await queue.add("inbound-message", parsed, {
      jobId: `wa-inbound:${parsed.waMessageId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });
    await queue.close();
  } finally {
    await connection.quit();
  }
}

/**
 * Enqueues an outbound send — both staff-composed replies (from the
 * dashboard) and AI-drafted auto-replies (from the inbound processor) go
 * through this single queue, so there is exactly one place that actually
 * calls the WhatsApp API. jobId is our own Message id, guarding against
 * accidentally enqueuing the same outbound send twice.
 */
export async function enqueueWhatsAppOutbound(payload: WhatsAppOutboundJob): Promise<void> {
  const parsed = whatsappOutboundJobSchema.parse(payload);
  const connection = createRedisConnection();
  try {
    const queue = new Queue(QUEUE_NAMES.whatsappOutbound, { connection });
    await queue.add("outbound-message", parsed, {
      jobId: `wa-outbound:${parsed.messageId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });
    await queue.close();
  } finally {
    await connection.quit();
  }
}
