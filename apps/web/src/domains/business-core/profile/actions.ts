"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Tenant } from "@aif/db";
import { tenantProfileSchema, type DataActionResult, type TenantProfileInput } from "@aif/shared";
import { requireTenantContext, requireWriteAccess, UnauthorizedError } from "@/domains/auth/guard";

export async function getTenantProfile(): Promise<DataActionResult<Tenant>> {
  try {
    const context = await requireTenantContext();
    const tenant = await getTenantDb(context.tenantId).tenant.findUnique({
      where: { id: context.tenantId },
    });
    if (!tenant) {
      return { error: "Workspace not found" };
    }
    return { data: tenant };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateTenantProfile(input: TenantProfileInput): Promise<DataActionResult<Tenant>> {
  try {
    const context = await requireWriteAccess();
    const parsed = tenantProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const tenant = await getTenantDb(context.tenantId).tenant.update({
      where: { id: context.tenantId },
      data: parsed.data,
    });

    revalidatePath("/dashboard/settings");
    return { data: tenant };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
