"use server";

import { getTenantDb } from "@aif/db";
import {
  isAiConfigured,
  missingAiEnvVars,
  detectIntent,
  draftReply,
  type DetectedIntent,
  type DraftReplyResult,
} from "@aif/ai";
import type { DataActionResult } from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";

export async function detectConversationIntent(message: string): Promise<DataActionResult<DetectedIntent>> {
  try {
    await requireTenantContext();
    if (!isAiConfigured()) {
      return { error: `AI is NOT CONFIGURED — set ${missingAiEnvVars().join(", ")}` };
    }

    const result = await detectIntent(message);
    return { data: result };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function generateDraftReply(conversationId: string): Promise<DataActionResult<DraftReplyResult>> {
  try {
    const context = await requireTenantContext();
    if (!isAiConfigured()) {
      return { error: `AI is NOT CONFIGURED — set ${missingAiEnvVars().join(", ")}` };
    }

    const tenantDb = getTenantDb(context.tenantId);
    const conversation = await tenantDb.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) {
      return { error: "Conversation not found" };
    }

    const messages = await tenantDb.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    const history = messages.map((m) => ({
      role: m.senderType === "CUSTOMER" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    }));
    const latestCustomerMessageId = [...messages].reverse().find((m) => m.senderType === "CUSTOMER")?.id;

    const result = await draftReply({
      tenantId: context.tenantId,
      conversationId,
      history,
      latestCustomerMessageId,
    });
    return { data: result };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
