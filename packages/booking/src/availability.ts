import { DateTime, Interval } from "luxon";
import { getTenantDb } from "@aif/db";

export interface AvailabilityParams {
  tenantId: string;
  serviceId: string;
  locationId: string;
  /** "YYYY-MM-DD", interpreted in the Location's own timezone. */
  date: string;
  staffMemberId?: string;
  /** How far apart candidate start times are, in minutes. */
  slotIntervalMinutes?: number;
}

export interface AvailabilitySlot {
  startAt: string;
  endAt: string;
}

export interface AvailabilityResult {
  timezone: string;
  slots: AvailabilitySlot[];
}

/**
 * Computes bookable start times for a Service at a Location on a given day,
 * respecting the Location's weekly hours (Phase 2), the Location's own
 * timezone (all wall-clock math happens in that zone, then converted to
 * UTC for storage/comparison), and existing Appointments.
 *
 * Conflict scope: if `staffMemberId` is given, only that person's own
 * appointments block a slot (they can't be in two places at once). If
 * omitted, ALL appointments at the Location (staffed or not) block a
 * slot — i.e. the Location itself is treated as having one concurrent
 * booking at a time. That's the right default for a single-practitioner
 * business (this platform's primary target) but under-counts true
 * capacity for a Location with several independent staff who could each
 * take a booking in parallel — callers who need that should always pass
 * staffMemberId. See docs/BUILD_PROGRESS.md's Phase 7 entry.
 */
export async function computeAvailableSlots(params: AvailabilityParams): Promise<AvailabilityResult> {
  const { tenantId, serviceId, locationId, date, staffMemberId, slotIntervalMinutes = 30 } = params;
  const db = getTenantDb(tenantId);

  const [location, service] = await Promise.all([
    db.location.findUnique({ where: { id: locationId }, include: { hours: true } }),
    db.service.findUnique({ where: { id: serviceId } }),
  ]);

  if (!location) throw new Error("Location not found");
  if (!service) throw new Error("Service not found");

  const requestedDate = DateTime.fromISO(date, { zone: location.timezone });
  if (!requestedDate.isValid) {
    throw new Error(`Invalid date "${date}"`);
  }

  // Luxon's `.weekday` is 1 (Monday) .. 7 (Sunday); LocationHours.dayOfWeek
  // is 0 (Sunday) .. 6 (Saturday) — matching JS Date.getDay().
  const dayOfWeek = requestedDate.weekday % 7;
  const hours = location.hours.find((h) => h.dayOfWeek === dayOfWeek);

  if (!hours || hours.isClosed) {
    return { timezone: location.timezone, slots: [] };
  }

  const [openHour, openMinute] = hours.openTime.split(":").map(Number);
  const [closeHour, closeMinute] = hours.closeTime.split(":").map(Number);

  const dayStart = requestedDate.set({ hour: openHour, minute: openMinute, second: 0, millisecond: 0 });
  const dayEnd = requestedDate.set({ hour: closeHour, minute: closeMinute, second: 0, millisecond: 0 });

  if (!dayStart.isValid || !dayEnd.isValid || dayEnd <= dayStart) {
    return { timezone: location.timezone, slots: [] };
  }

  const existing = await db.appointment.findMany({
    where: {
      locationId,
      ...(staffMemberId ? { staffMemberId } : {}),
      status: { notIn: ["CANCELLED"] },
      startAt: { lt: dayEnd.toJSDate() },
      endAt: { gt: dayStart.toJSDate() },
    },
    select: { startAt: true, endAt: true },
  });

  const busyIntervals = existing.map((a) =>
    Interval.fromDateTimes(DateTime.fromJSDate(a.startAt), DateTime.fromJSDate(a.endAt)),
  );

  const now = DateTime.now();
  const slots: AvailabilitySlot[] = [];
  let cursor = dayStart;

  while (cursor.plus({ minutes: service.durationMinutes }) <= dayEnd) {
    const slotEnd = cursor.plus({ minutes: service.durationMinutes });
    const candidate = Interval.fromDateTimes(cursor, slotEnd);

    if (cursor >= now && !busyIntervals.some((busy) => busy.overlaps(candidate))) {
      slots.push({ startAt: cursor.toUTC().toISO()!, endAt: slotEnd.toUTC().toISO()! });
    }

    cursor = cursor.plus({ minutes: slotIntervalMinutes });
  }

  return { timezone: location.timezone, slots };
}
