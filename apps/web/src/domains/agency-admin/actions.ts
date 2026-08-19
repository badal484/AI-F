"use server";

import { revalidatePath } from "next/cache";
import { getPlatformDb, type Tenant, type Subscription, type Agency } from "@aif/db";
import { setTenantSuspendedSchema, type SetTenantSuspendedInput, type DataActionResult } from "@aif/shared";
import { requireAgencyAdmin } from "@/domains/agency-admin/guard";
import { UnauthorizedError } from "@/domains/auth/guard";

export type TenantWithBilling = Tenant & {
  subscription: Subscription | null;
  _count: { users: number };
};

export interface AgencyStats {
  totalTenants: number;
  suspendedTenants: number;
  totalUsers: number;
}

// Every query here is manually filtered by agencyId — there is no Prisma
// Client Extension enforcing agency-scoping the way getTenantDb()
// enforces tenant-scoping (see AgencyAdmin's own doc comment in
// schema.prisma), so getPlatformDb() plus an explicit agencyId in every
// where clause IS the isolation boundary for this whole domain. Get this
// wrong here and it's a real cross-agency data leak, not just noise.
export async function getAgencyProfile(): Promise<DataActionResult<Agency>> {
  try {
    const context = await requireAgencyAdmin();
    const agency = await getPlatformDb().agency.findUnique({ where: { id: context.agencyId } });
    if (!agency) {
      return { error: "Agency not found" };
    }
    return { data: agency };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function listAgencyTenants(): Promise<DataActionResult<TenantWithBilling[]>> {
  try {
    const context = await requireAgencyAdmin();
    const tenants = await getPlatformDb().tenant.findMany({
      where: { agencyId: context.agencyId },
      include: { subscription: true, _count: { select: { users: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { data: tenants };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function getAgencyStats(): Promise<DataActionResult<AgencyStats>> {
  try {
    const context = await requireAgencyAdmin();
    const db = getPlatformDb();

    const [totalTenants, suspendedTenants, totalUsers] = await Promise.all([
      db.tenant.count({ where: { agencyId: context.agencyId } }),
      db.tenant.count({ where: { agencyId: context.agencyId, isSuspended: true } }),
      db.user.count({ where: { tenant: { agencyId: context.agencyId } } }),
    ]);

    return { data: { totalTenants, suspendedTenants, totalUsers } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function setAgencyTenantSuspended(input: SetTenantSuspendedInput): Promise<DataActionResult<Tenant>> {
  try {
    const context = await requireAgencyAdmin();
    const parsed = setTenantSuspendedSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    // updateMany (not update) so the where clause itself enforces
    // agencyId — an agency admin passing another agency's tenantId
    // matches zero rows rather than ever touching it.
    const result = await getPlatformDb().tenant.updateMany({
      where: { id: parsed.data.tenantId, agencyId: context.agencyId },
      data: {
        isSuspended: parsed.data.isSuspended,
        suspendedAt: parsed.data.isSuspended ? new Date() : null,
      },
    });
    if (result.count === 0) {
      return { error: "Tenant not found" };
    }

    const tenant = await getPlatformDb().tenant.findUniqueOrThrow({ where: { id: parsed.data.tenantId } });

    revalidatePath("/agency-admin");
    return { data: tenant };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
