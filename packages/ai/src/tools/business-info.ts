import { tool } from "ai";
import { z } from "zod";
import { getTenantDb } from "@aif/db";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Read-only lookup of this tenant's real services, locations, and hours.
 * The AI must call this for any factual claim about pricing, duration,
 * address, or hours — never invent them (MASTER_INSTRUCTIONS.md §5).
 *
 * Includes each service's/location's `id` — checkAvailability and
 * bookAppointment (Phase 7) need those to know exactly what's being
 * booked, not just a display name.
 */
export function createGetBusinessInfoTool(tenantId: string) {
  return tool({
    description:
      "Look up this business's real services (id, name, description, duration, price), locations (id, address, phone), and weekly operating hours. Always call this before stating any price, duration, address, or hours to a customer — never guess or invent these facts. Also use it to find a service's/location's id before calling checkAvailability or bookAppointment.",
    inputSchema: z.object({}),
    execute: async () => {
      const db = getTenantDb(tenantId);
      const [tenant, services, locations] = await Promise.all([
        db.tenant.findUnique({ where: { id: tenantId } }),
        db.service.findMany({ where: { isActive: true } }),
        db.location.findMany({ include: { hours: true } }),
      ]);

      return {
        businessName: tenant?.name ?? null,
        description: tenant?.description ?? null,
        phone: tenant?.phone ?? null,
        website: tenant?.website ?? null,
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          price: `${(s.priceCents / 100).toFixed(2)} ${s.currency.toUpperCase()}`,
        })),
        locations: locations.map((l) => ({
          id: l.id,
          name: l.name,
          timezone: l.timezone,
          address: [l.addressLine1, l.addressLine2, l.city, l.state, l.postalCode]
            .filter(Boolean)
            .join(", "),
          phone: l.phone,
          hours: l.hours
            .slice()
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map((h) => ({
              day: DAY_LABELS[h.dayOfWeek],
              closed: h.isClosed,
              openTime: h.openTime,
              closeTime: h.closeTime,
            })),
        })),
      };
    },
  });
}
