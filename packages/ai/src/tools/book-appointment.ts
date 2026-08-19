import { tool } from "ai";
import { z } from "zod";
import { getTenantDb } from "@aif/db";
import { bookAppointment as bookAppointmentCore } from "@aif/booking";

/**
 * Books a real Appointment (packages/booking — re-validates the slot is
 * still free inside a transaction). MASTER_INSTRUCTIONS.md §5: the AI
 * must never claim a booking succeeded unless this tool actually
 * returned booked: true — the reply-drafting system prompt says so
 * explicitly.
 */
export function createBookAppointmentTool(tenantId: string, conversationId: string) {
  return tool({
    description:
      "Book a real appointment. Only call this after the customer has confirmed an exact time you got from checkAvailability. Never tell the customer they're booked before this tool returns booked: true — if it returns booked: false, relay the reason and offer to check other times.",
    inputSchema: z.object({
      serviceId: z.string().min(1),
      locationId: z.string().min(1),
      startAt: z.string().min(1).describe("Exact ISO start time, taken from a checkAvailability result"),
      staffMemberId: z.string().optional(),
      customerName: z.string().min(1),
      customerEmail: z.string().email().optional(),
      customerPhone: z.string().optional(),
    }),
    execute: async (input) => {
      const db = getTenantDb(tenantId);
      const conversation = await db.conversation.findUnique({ where: { id: conversationId } });

      const result = await bookAppointmentCore({
        tenantId,
        conversationId,
        customerId: conversation?.customerId ?? undefined,
        ...input,
      });

      if (!result.booked) {
        return { booked: false, reason: result.reason };
      }
      return {
        booked: true,
        appointmentId: result.appointment.id,
        startAt: result.appointment.startAt.toISOString(),
        endAt: result.appointment.endAt.toISOString(),
      };
    },
  });
}
