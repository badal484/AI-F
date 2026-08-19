"use server";

import { revalidatePath } from "next/cache";
import { getPlatformDb, type Tenant, type Subscription } from "@aif/db";
import { setTenantSuspendedSchema, type SetTenantSuspendedInput, type DataActionResult } from "@aif/shared";
import { requirePlatformAdmin } from "@/domains/platform-admin/guard";
import { UnauthorizedError } from "@/domains/auth/guard";

export type TenantWithBilling = Tenant & {
  subscription: Subscription | null;
  _count: { users: number };
};

export interface PlatformStats {
  totalTenants: number;
  suspendedTenants: number;
  tenantsByPlan: { key: string; count: number }[];
  totalUsers: number;
}

// Every action here deliberately uses getPlatformDb(), never
// getTenantDb() — this domain's entire point is cross-tenant access, and
// requirePlatformAdmin() (not requireTenantContext()/requireWriteAccess())
// is the gate. See PlatformAdmin's doc comment in schema.prisma.
export async function listTenants(): Promise<DataActionResult<TenantWithBilling[]>> {
  try {
    await requirePlatformAdmin();
    const tenants = await getPlatformDb().tenant.findMany({
      include: { subscription: true, _count: { select: { users: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { data: tenants };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function getPlatformStats(): Promise<DataActionResult<PlatformStats>> {
  try {
    await requirePlatformAdmin();
    const db = getPlatformDb();

    const [totalTenants, suspendedTenants, planGroups, totalUsers] = await Promise.all([
      db.tenant.count(),
      db.tenant.count({ where: { isSuspended: true } }),
      db.subscription.groupBy({ by: ["planTier"], _count: { _all: true } }),
      db.user.count(),
    ]);

    // Tenants with no Subscription row are implicitly on FREE (see
    // Subscription's own doc comment) — not represented by any groupBy
    // row, so back it out from the total rather than querying for it
    // separately.
    const subscribedCount = planGroups.reduce((sum, g) => sum + g._count._all, 0);
    const tenantsByPlan = [
      { key: "FREE", count: totalTenants - subscribedCount },
      ...planGroups.map((g) => ({ key: g.planTier, count: g._count._all })),
    ];

    return { data: { totalTenants, suspendedTenants, tenantsByPlan, totalUsers } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function setTenantSuspended(input: SetTenantSuspendedInput): Promise<DataActionResult<Tenant>> {
  try {
    await requirePlatformAdmin();
    const parsed = setTenantSuspendedSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const tenant = await getPlatformDb().tenant.update({
      where: { id: parsed.data.tenantId },
      data: {
        isSuspended: parsed.data.isSuspended,
        suspendedAt: parsed.data.isSuspended ? new Date() : null,
      },
    });

    revalidatePath("/platform-admin");
    return { data: tenant };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
