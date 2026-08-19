"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Message, type User } from "@aif/db";
import { enqueueWhatsAppOutbound, isRedisConfigured } from "@aif/queue";
import { createLogger, logNotConfigured, sendMessageSchema, type SendMessageInput, type DataActionResult } from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";

const logger = createLogger("web:inbox");

export type MessageWithSender = Message & { sender: Pick<User, "id" | "name" | "email"> | null };

export async function listMessages(conversationId: string): Promise<DataActionResult<MessageWithSender[]>> {
  try {
    const context = await requireTenantContext();
    const messages = await getTenantDb(context.tenantId).message.findMany({
      where: { conversationId },
      include: { sender: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return { data: messages };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function sendMessage(input: SendMessageInput): Promise<DataActionResult<MessageWithSender>> {
  try {
    const context = await requireTenantContext();
    const parsed = sendMessageSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { conversationId, senderType, body } = parsed.data;
    const tenantDb = getTenantDb(context.tenantId);

    const conversation = await tenantDb.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: { select: { phone: true } } },
    });
    if (!conversation) {
      return { error: "Conversation not found" };
    }

    // Message + parent Conversation.lastMessageAt are updated together — a
    // multi-table write per MASTER_INSTRUCTIONS.md §4.
    const message = await tenantDb.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          tenantId: context.tenantId,
          conversationId,
          senderType,
          senderId: senderType === "STAFF" ? context.userId : null,
          body,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      return tx.message.findUniqueOrThrow({
        where: { id: created.id },
        include: { sender: { select: { id: true, name: true, email: true } } },
      });
    });

    // A staff reply in a WhatsApp conversation needs to actually go out
    // over WhatsApp, not just be recorded — enqueue it for apps/worker's
    // outbound processor (the one place that calls the real API; see
    // packages/queue). If Redis isn't configured, the message still saves
    // (staff sees it in the inbox) but nothing is dispatched — logged,
    // not faked, per MASTER_INSTRUCTIONS.md §7.
    if (senderType === "STAFF" && conversation.channel === "WHATSAPP" && conversation.customer?.phone) {
      if (isRedisConfigured()) {
        await enqueueWhatsAppOutbound({
          tenantId: context.tenantId,
          conversationId,
          messageId: message.id,
          toPhoneNumber: conversation.customer.phone,
          body: message.body,
        });
      } else {
        logNotConfigured(logger, "Redis", ["REDIS_URL"]);
      }
    }

    revalidatePath("/dashboard/inbox");
    return { data: message };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
