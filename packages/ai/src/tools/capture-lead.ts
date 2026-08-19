import { tool } from "ai";
import { z } from "zod";
import { getTenantDb } from "@aif/db";

/**
 * Saves a real Lead row via the same CRM (Phase 3) this tenant's staff use
 * — this is a real write, not a simulated one, so it must actually
 * succeed before the AI is allowed to tell the customer their info was
 * saved (MASTER_INSTRUCTIONS.md §5, "never fake actions").
 */
export function createCaptureLeadTool(tenantId: string, conversationId: string) {
  return tool({
    description:
      "Save a new lead/prospect to the CRM when the customer expresses interest in a service, asks about pricing or booking, or shares contact info not already on file. Call at most once per conversation.",
    inputSchema: z.object({
      name: z.string().min(1).describe("The customer's name, as they gave it"),
      email: z.string().email().optional().describe("The customer's email, if they gave one"),
      phone: z.string().optional().describe("The customer's phone number, if they gave one"),
      notes: z.string().optional().describe("Brief context about what they're interested in"),
    }),
    execute: async (input) => {
      const db = getTenantDb(tenantId);
      // Lead + linking it to the Conversation are a multi-table write, per
      // MASTER_INSTRUCTIONS.md §4.
      const lead = await db.$transaction(async (tx) => {
        const created = await tx.lead.create({
          data: {
            tenantId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            notes: input.notes,
            source: "WEBSITE",
          },
        });
        await tx.conversation.update({ where: { id: conversationId }, data: { leadId: created.id } });
        return created;
      });
      return { leadId: lead.id, captured: true };
    },
  });
}
