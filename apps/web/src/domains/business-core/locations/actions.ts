"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Location, type LocationHours } from "@aif/db";
import {
  createLocationSchema,
  updateLocationSchema,
  updateLocationHoursSchema,
  deleteByIdSchema,
  nullifyEmptyStrings,
  type CreateLocationInput,
  type UpdateLocationInput,
  type UpdateLocationHoursInput,
  type DeleteByIdInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, requireWriteAccess, UnauthorizedError } from "@/domains/auth/guard";

export async function listLocations(): Promise<DataActionResult<Location[]>> {
  try {
    const context = await requireTenantContext();
    const locations = await getTenantDb(context.tenantId).location.findMany({
      orderBy: { createdAt: "asc" },
    });
    return { data: locations };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createLocation(input: CreateLocationInput): Promise<DataActionResult<Location>> {
  try {
    const context = await requireWriteAccess();
    const parsed = createLocationSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const location = await getTenantDb(context.tenantId).location.create({
      data: { ...nullifyEmptyStrings(parsed.data), tenantId: context.tenantId },
    });

    revalidatePath("/dashboard/locations");
    return { data: location };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateLocation(input: UpdateLocationInput): Promise<DataActionResult<Location>> {
  try {
    const context = await requireWriteAccess();
    const parsed = updateLocationSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { id, ...data } = parsed.data;

    const location = await getTenantDb(context.tenantId).location.update({
      where: { id },
      data: nullifyEmptyStrings(data),
    });

    revalidatePath("/dashboard/locations");
    return { data: location };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function deleteLocation(input: DeleteByIdInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireWriteAccess();
    const parsed = deleteByIdSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).location.delete({ where: { id: parsed.data.id } });

    revalidatePath("/dashboard/locations");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function listLocationHours(locationId: string): Promise<DataActionResult<LocationHours[]>> {
  try {
    const context = await requireTenantContext();
    const hours = await getTenantDb(context.tenantId).locationHours.findMany({
      where: { locationId },
      orderBy: { dayOfWeek: "asc" },
    });
    return { data: hours };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateLocationHours(
  input: UpdateLocationHoursInput,
): Promise<DataActionResult<LocationHours[]>> {
  try {
    const context = await requireWriteAccess();
    const parsed = updateLocationHoursSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { locationId, days } = parsed.data;

    const tenantDb = getTenantDb(context.tenantId);

    // Confirm the location actually belongs to this tenant before writing —
    // upsert's where clause below is scoped by the (locationId, dayOfWeek)
    // unique index, not tenantId directly, so this check is what prevents
    // writing hours onto another tenant's location by guessing its id.
    const location = await tenantDb.location.findUnique({ where: { id: locationId } });
    if (!location) {
      return { error: "Location not found" };
    }

    const updated = await tenantDb.$transaction(
      days.map((day) =>
        tenantDb.locationHours.upsert({
          where: { locationId_dayOfWeek: { locationId, dayOfWeek: day.dayOfWeek } },
          create: { locationId, tenantId: context.tenantId, ...day },
          update: day,
        }),
      ),
    );

    revalidatePath("/dashboard/locations");
    return { data: updated };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
