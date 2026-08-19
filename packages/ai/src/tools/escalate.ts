import { tool } from "ai";
import { z } from "zod";
import { getTenantDb } from "@aif/db";

/**
 * Human Handoff (MASTER_INSTRUCTIONS.md §5): marks the Conversation
 * HUMAN_REQUIRED and pauses automated replies going forward. This is the
 * AI-triggered counterpart to the manual "take over" status change staff
 * can already make from the Phase 4 inbox UI.
 */
export function createEscalateToHumanTool(tenantId: string, conversationId: string) {
  return tool({
    description:
      "Hand this conversation off to a human member of staff and stop replying automatically. Call this when the customer is frustrated or upset, explicitly asks for a person, or asks something you cannot help with using your tools — including checking or booking a specific appointment slot, since booking isn't available yet.",
    inputSchema: z.object({
      reason: z.string().min(1).describe("Brief reason for staff, e.g. why you couldn't help"),
    }),
    execute: async (input) => {
      const db = getTenantDb(tenantId);
      await db.conversation.update({
        where: { id: conversationId },
        data: { status: "HUMAN_REQUIRED" },
      });
      return { escalated: true, reason: input.reason };
    },
  });
}
