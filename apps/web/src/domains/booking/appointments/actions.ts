"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Appointment } from "@aif/db";
import { computeAvailableSlots, bookAppointment, type AvailabilityResult } from "@aif/booking";
import { cancelAutomationRunsForEntity } from "@aif/automations";
import {
  checkAvailabilitySchema,
  createAppointmentSchema,
  updateAppointmentStatusSchema,
  nullifyEmptyStrings,
  type CheckAvailabilityInput,
  type CreateAppointmentInput,
  type UpdateAppointmentStatusInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";

export type AppointmentWithRelations = Appointment & {
  service: { name: string };
  location: { name: string; timezone: string };
  staffMember: { name: string } | null;
};

export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<DataActionResult<AvailabilityResult>> {
  try {
    const context = await requireTenantContext();
    const parsed = checkAvailabilitySchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { staffMemberId, ...rest } = nullifyEmptyStrings(parsed.data);

    const result = await computeAvailableSlots({
      tenantId: context.tenantId,
      staffMemberId: staffMemberId ?? undefined,
      ...rest,
    });
    return { data: result };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    if (err instanceof Error) return { error: err.message };
    throw err;
  }
}

export async function listAppointments(): Promise<DataActionResult<AppointmentWithRelations[]>> {
  try {
    const context = await requireTenantContext();
    const appointments = await getTenantDb(context.tenantId).appointment.findMany({
      include: {
        service: { select: { name: true } },
        location: { select: { name: true, timezone: true } },
        staffMember: { select: { name: true } },
      },
      orderBy: { startAt: "desc" },
    });
    return { data: appointments };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<DataActionResult<AppointmentWithRelations>> {
  try {
    const context = await requireTenantContext();
    const parsed = createAppointmentSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { staffMemberId, customerId, ...rest } = nullifyEmptyStrings(parsed.data);

    const result = await bookAppointment({
      tenantId: context.tenantId,
      staffMemberId: staffMemberId ?? undefined,
      customerId: customerId ?? undefined,
      ...rest,
    });

    if (!result.booked) {
      return { error: result.reason };
    }

    const withRelations = await getTenantDb(context.tenantId).appointment.findUniqueOrThrow({
      where: { id: result.appointment.id },
      include: {
        service: { select: { name: true } },
        location: { select: { name: true, timezone: true } },
        staffMember: { select: { name: true } },
      },
    });

    revalidatePath("/dashboard/appointments");
    return { data: withRelations };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateAppointmentStatus(
  input: UpdateAppointmentStatusInput,
): Promise<DataActionResult<AppointmentWithRelations>> {
  try {
    const context = await requireTenantContext();
    const parsed = updateAppointmentStatusSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const appointment = await getTenantDb(context.tenantId).appointment.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status },
      include: {
        service: { select: { name: true } },
        location: { select: { name: true, timezone: true } },
        staffMember: { select: { name: true } },
      },
    });

    // Cancel any still-pending automation reminders (e.g. a WhatsApp
    // reminder scheduled before this appointment starts) — sending one
    // for an appointment that's no longer happening would be wrong.
    if (parsed.data.status === "CANCELLED") {
      await cancelAutomationRunsForEntity(context.tenantId, appointment.id);
    }

    revalidatePath("/dashboard/appointments");
    return { data: appointment };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
