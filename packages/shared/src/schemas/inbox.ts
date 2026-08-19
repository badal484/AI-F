import { z } from "zod";

const id = z.string().min(1);

export const CONVERSATION_CHANNELS = ["WEBSITE", "WHATSAPP", "MANUAL", "VOICE"] as const;
export const CONVERSATION_STATUSES = ["OPEN", "HUMAN_REQUIRED", "CLOSED"] as const;

/**
 * Only CUSTOMER (staff manually logging what a customer said, e.g. from a
 * phone call) and STAFF (an actual reply) are reachable through the UI.
 * "AI" exists in the Prisma enum for Phase 5 forward-compatibility but is
 * deliberately not offered as a choice here — there is no AI in Phase 4,
 * and letting a human pick "AI" as the sender would misrepresent who
 * actually said what.
 */
export const MESSAGE_SENDER_INPUTS = ["CUSTOMER", "STAFF"] as const;

export const createConversationSchema = z.object({
  customerId: z.string().min(1).optional().or(z.literal("")),
  leadId: z.string().min(1).optional().or(z.literal("")),
  channel: z.enum(CONVERSATION_CHANNELS).default("MANUAL"),
  initialMessage: z.string().min(1).max(4000),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const sendMessageSchema = z.object({
  conversationId: id,
  senderType: z.enum(MESSAGE_SENDER_INPUTS),
  body: z.string().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const assignConversationSchema = z.object({
  id,
  assignedToId: z.string().min(1).optional().or(z.literal("")),
});
export type AssignConversationInput = z.infer<typeof assignConversationSchema>;

export const updateConversationStatusSchema = z.object({
  id,
  status: z.enum(CONVERSATION_STATUSES),
});
export type UpdateConversationStatusInput = z.infer<typeof updateConversationStatusSchema>;
