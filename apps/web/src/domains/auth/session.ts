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
 * This is one of only two places that read through getPlatformDb()
 * instead of getTenantDb(tenantId) for User/Tenant identity resolution
 * (the other being requirePlatformAdmin(), a separate identity entirely)
 * — at this point we don't yet know which tenant the caller belongs to,
 * so there is no tenantId to scope a tenant-scoped client with. The
 * lookup is a single indexed read on the globally-unique supabaseUserId
 * column. Every other server-side read/write must go through
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
    include: { tenant: { select: { slug: true, name: true, isSuspended: true } } },
  });

  if (!dbUser) {
    return null;
  }

  return {
    tenantId: dbUser.tenantId,
    tenantSlug: dbUser.tenant.slug,
    tenantName: dbUser.tenant.name,
    userId: dbUser.id,
    userEmail: dbUser.email,
    role: dbUser.role,
    isSuspended: dbUser.tenant.isSuspended,
  };
}
