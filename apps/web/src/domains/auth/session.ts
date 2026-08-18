import "server-only";
import { getPlatformDb } from "@aif/db";
import type { TenantContext } from "@aif/shared";
import { createClient } from "@/lib/supabase/server";
import { isDatabaseConfigured, isSupabaseConfigured } from "@/lib/env";

/**
 * Resolves the current request's tenant context from the Supabase session,
 * or null if unauthenticated / not yet provisioned into a tenant.
 *
 * This is the ONLY place outside Phase 13 (Platform Admin) that reads
 * through getPlatformDb() instead of getTenantDb(tenantId) — at this point
 * we don't yet know which tenant the caller belongs to, so there is no
 * tenantId to scope a tenant-scoped client with. The lookup is a single
 * indexed read on the globally-unique supabaseUserId column. Every other
 * server-side read/write must go through getTenantDb(context.tenantId).
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
    include: { tenant: { select: { slug: true, name: true } } },
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
  };
}
