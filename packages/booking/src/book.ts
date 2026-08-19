import { getTenantDb, Prisma, type Appointment } from "@aif/db";

export interface BookAppointmentParams {
  tenantId: string;
  serviceId: string;
  locationId: string;
  staffMemberId?: string;
  customerId?: string;
  conversationId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  /** ISO datetime (any offset — converted to UTC for storage). */
  startAt: string;
  notes?: string;
}

export type BookAppointmentResult =
  | { booked: true; appointment: Appointment }
  | { booked: false; reason: string };

class BookingConflictError extends Error {}

/**
 * Books an Appointment, re-checking for a conflicting Appointment inside
 * the same transaction — the slot a caller saw from computeAvailableSlots()
 * a moment earlier could have been taken by someone else since. Runs at
 * Serializable isolation so Postgres itself rejects a genuinely
 * concurrent conflicting write (not just our own re-check query) with a
 * P2034 error, which is treated the same as a plain conflict.
 *
 * This is real conflict prevention, not a guarantee of perfect atomicity —
 * the ideal fix is a Postgres EXCLUDE constraint (via btree_gist) on
 * (locationId, staffMemberId, tstzrange(startAt, endAt)), which Prisma's
 * schema can't express. Documented as a known limitation in
 * docs/BUILD_PROGRESS.md's Phase 7 entry; revisit if this ever needs to
 * hold up under real concurrent load.
 */
export async function bookAppointment(params: BookAppointmentParams): Promise<BookAppointmentResult> {
  const db = getTenantDb(params.tenantId);

  const [service, location] = await Promise.all([
    db.service.findUnique({ where: { id: params.serviceId } }),
    db.location.findUnique({ where: { id: params.locationId } }),
  ]);
  if (!service) return { booked: false, reason: "Service not found" };
  if (!location) return { booked: false, reason: "Location not found" };

  const startAt = new Date(params.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return { booked: false, reason: "Invalid start time" };
  }
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  try {
    const appointment = await db.$transaction(
      async (tx) => {
        const conflict = await tx.appointment.findFirst({
          where: {
            locationId: params.locationId,
            ...(params.staffMemberId ? { staffMemberId: params.staffMemberId } : {}),
            status: { notIn: ["CANCELLED"] },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
        });
        if (conflict) {
          throw new BookingConflictError();
        }

        return tx.appointment.create({
          data: {
            tenantId: params.tenantId,
            serviceId: params.serviceId,
            locationId: params.locationId,
            staffMemberId: params.staffMemberId,
            customerId: params.customerId,
            conversationId: params.conversationId,
            customerName: params.customerName,
            customerEmail: params.customerEmail,
            customerPhone: params.customerPhone,
            startAt,
            endAt,
            notes: params.notes,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { booked: true, appointment };
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return { booked: false, reason: "That time is no longer available" };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return { booked: false, reason: "That time was just booked by someone else — please try another slot" };
    }
    throw err;
  }
}
