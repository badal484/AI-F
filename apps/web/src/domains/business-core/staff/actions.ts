"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type StaffMember, type TenantDb } from "@aif/db";
import {
  createStaffMemberSchema,
  updateStaffMemberSchema,
  deleteByIdSchema,
  nullifyEmptyStrings,
  type CreateStaffMemberInput,
  type UpdateStaffMemberInput,
  type DeleteByIdInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, requireWriteAccess, UnauthorizedError } from "@/domains/auth/guard";

async function assertLocationBelongsToTenant(tenantDb: TenantDb, locationId: string | null | undefined) {
  if (!locationId) return true;
  const location = await tenantDb.location.findUnique({ where: { id: locationId } });
  return Boolean(location);
}

export async function listStaffMembers(): Promise<DataActionResult<StaffMember[]>> {
  try {
    const context = await requireTenantContext();
    const staff = await getTenantDb(context.tenantId).staffMember.findMany({
      orderBy: { createdAt: "asc" },
    });
    return { data: staff };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createStaffMember(
  input: CreateStaffMemberInput,
): Promise<DataActionResult<StaffMember>> {
  try {
    const context = await requireWriteAccess();
    const parsed = createStaffMemberSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const data = nullifyEmptyStrings(parsed.data);
    const tenantDb = getTenantDb(context.tenantId);

    if (!(await assertLocationBelongsToTenant(tenantDb, data.locationId))) {
      return { error: "Location not found" };
    }

    const staffMember = await tenantDb.staffMember.create({
      data: { ...data, tenantId: context.tenantId },
    });

    revalidatePath("/dashboard/staff");
    return { data: staffMember };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateStaffMember(
  input: UpdateStaffMemberInput,
): Promise<DataActionResult<StaffMember>> {
  try {
    const context = await requireWriteAccess();
    const parsed = updateStaffMemberSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { id, ...rest } = parsed.data;
    const data = nullifyEmptyStrings(rest);
    const tenantDb = getTenantDb(context.tenantId);

    if (!(await assertLocationBelongsToTenant(tenantDb, data.locationId))) {
      return { error: "Location not found" };
    }

    const staffMember = await tenantDb.staffMember.update({ where: { id }, data });

    revalidatePath("/dashboard/staff");
    return { data: staffMember };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function deleteStaffMember(input: DeleteByIdInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireWriteAccess();
    const parsed = deleteByIdSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).staffMember.delete({ where: { id: parsed.data.id } });

    revalidatePath("/dashboard/staff");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
