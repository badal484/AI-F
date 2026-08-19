import "server-only";
import { getPlatformDb } from "@aif/db";
import type { TenantContext } from "@aif/shared";
import { createClient } from "@/lib/supabase/server";
import { isDatabaseConfigured, isSupabaseConfigured } from "@/lib/env";

/**
 * Resolves the current request's tenant context from the Supabase session,
 * or null if unauthenticated / not yet provisioned into a tenant. A
 * suspended tenant (Phase 13) still resolves to a real context, not null
 * — isSuspended: true — specifically so a legitimately-authenticated user
 * of a suspended workspace can be shown a real "your workspace was
 * suspended" message instead of a confusing silent redirect back to
 * /login that a bare null would produce. requireTenantContext() blocks on
 * isSuspended for everything except that one page's own messaging.
 *
 * This is one of the few places that read through getPlatformDb() instead
 * of getTenantDb(tenantId) for identity resolution (see getPlatformDb()'s
 * own doc comment in packages/db for the full list) — at this point we
 * don't yet know which tenant the caller belongs to, so there is no
 * tenantId to scope a tenant-scoped client with. The lookup is a single
 * indexed read on the globally-unique supabaseUserId column, including
 * the tenant's Agency (if any) for white-label branding (Phase 18) in the
 * same query. Every other server-side read/write must go through
 * getTenantDb(context.tenantId).
 */
export async function resolveTenantContext(): Promise<TenantContext | null> {
  if (!isSupabaseConfigured() || !isDatabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const dbUser = await getPlatformDb().user.findUnique({
    where: { supabaseUserId: user.id },
    include: {
      tenant: {
        select: {
          slug: true,
          name: true,
          isSuspended: true,
          agency: { select: { name: true, logoUrl: true, primaryColor: true } },
        },
      },
    },
  });

  if (!dbUser) {
    return null;
  }

  const agency = dbUser.tenant.agency;
  const agencyBranding =
    agency && (agency.logoUrl || agency.primaryColor)
      ? { name: agency.name, logoUrl: agency.logoUrl, primaryColor: agency.primaryColor }
      : null;

  return {
    tenantId: dbUser.tenantId,
    tenantSlug: dbUser.tenant.slug,
    tenantName: dbUser.tenant.name,
    userId: dbUser.id,
    userEmail: dbUser.email,
    role: dbUser.role,
    isSuspended: dbUser.tenant.isSuspended,
    agencyBranding,
  };
}
