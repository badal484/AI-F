"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Message, type User } from "@aif/db";
import { sendMessageSchema, type SendMessageInput, type DataActionResult } from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";

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

    const conversation = await tenantDb.conversation.findUnique({ where: { id: conversationId } });
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

    revalidatePath("/dashboard/inbox");
    return { data: message };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
