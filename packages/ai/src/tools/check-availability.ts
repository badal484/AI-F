import { tool } from "ai";
import { z } from "zod";
import { computeAvailableSlots } from "@aif/booking";

/**
 * Real availability, computed from the Location's actual hours and
 * existing Appointments (packages/booking) — never invented. Requires a
 * serviceId/locationId, which the AI should get from getBusinessInfo
 * first.
 */
export function createCheckAvailabilityTool(tenantId: string) {
  return tool({
    description:
      "Check real bookable time slots for a service at a location on a given date. Get serviceId/locationId from getBusinessInfo first. Always call this before proposing a specific time to a customer — never guess what might be free.",
    inputSchema: z.object({
      serviceId: z.string().min(1),
      locationId: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, in the location's own timezone"),
      staffMemberId: z.string().optional().describe("Only if the customer asked for a specific person"),
    }),
    execute: async (input) => {
      try {
        const result = await computeAvailableSlots({ tenantId, ...input });
        return {
          timezone: result.timezone,
          slots: result.slots.map((s) => s.startAt),
          slotCount: result.slots.length,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Could not check availability" };
      }
    },
  });
}
