"use server";

import { revalidatePath } from "next/cache";
import { getPlatformDb, type Tenant, type Subscription, type Agency } from "@aif/db";
import {
  setTenantSuspendedSchema,
  createAgencySchema,
  setTenantAgencySchema,
  nullifyEmptyStrings,
  type SetTenantSuspendedInput,
  type CreateAgencyInput,
  type SetTenantAgencyInput,
  type DataActionResult,
} from "@aif/shared";
import { requirePlatformAdmin } from "@/domains/platform-admin/guard";
import { UnauthorizedError } from "@/domains/auth/guard";

export type TenantWithBilling = Tenant & {
  subscription: Subscription | null;
  agency: { id: string; name: string } | null;
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
      include: {
        subscription: true,
        agency: { select: { id: true, name: true } },
        _count: { select: { users: true } },
      },
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

// Phase 18 — White-Label / Reseller Architecture. Creating an Agency
// (a reseller relationship) is a platform-admin action, not self-serve —
// same trust-tier reasoning as everything else in this file. Provisioning
// that Agency's first AgencyAdmin identity, though, stays a manual DB
// step, same as PlatformAdmin itself — see AgencyAdmin's doc comment in
// schema.prisma for why extending the "no in-app identity creation" rule
// to AgencyAdmin too (rather than building a one-off UI for just this
// identity) is the more consistent, not the lazier, choice.
export async function listAgencies(): Promise<DataActionResult<(Agency & { _count: { tenants: number } })[]>> {
  try {
    await requirePlatformAdmin();
    const agencies = await getPlatformDb().agency.findMany({
      include: { _count: { select: { tenants: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { data: agencies };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createAgency(input: CreateAgencyInput): Promise<DataActionResult<Agency>> {
  try {
    await requirePlatformAdmin();
    const parsed = createAgencySchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const data = nullifyEmptyStrings(parsed.data);

    const existing = await getPlatformDb().agency.findUnique({ where: { slug: data.slug } });
    if (existing) {
      return { error: "That agency slug is already taken" };
    }

    const agency = await getPlatformDb().agency.create({
      data: {
        name: data.name,
        slug: data.slug,
        logoUrl: data.logoUrl,
        primaryColor: data.primaryColor,
        supportEmail: data.supportEmail,
      },
    });

    revalidatePath("/platform-admin");
    return { data: agency };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function setTenantAgency(input: SetTenantAgencyInput): Promise<DataActionResult<Tenant>> {
  try {
    await requirePlatformAdmin();
    const parsed = setTenantAgencySchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { tenantId, agencyId } = nullifyEmptyStrings(parsed.data);

    if (agencyId) {
      const agency = await getPlatformDb().agency.findUnique({ where: { id: agencyId }, select: { id: true } });
      if (!agency) {
        return { error: "Agency not found" };
      }
    }

    const tenant = await getPlatformDb().tenant.update({
      where: { id: tenantId },
      data: { agencyId: agencyId ?? null },
    });

    revalidatePath("/platform-admin");
    return { data: tenant };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
