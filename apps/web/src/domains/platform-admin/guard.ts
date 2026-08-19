import "server-only";
import { getPlatformDb } from "@aif/db";
import { createClient } from "@/lib/supabase/server";
import { isDatabaseConfigured, isSupabaseConfigured } from "@/lib/env";
import { UnauthorizedError } from "@/domains/auth/guard";

export interface PlatformAdminContext {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Resolves the current request's PlatformAdmin identity — an entirely
 * separate check from resolveTenantContext()/requireTenantContext().
 * Reuses the same Supabase session as tenant Users (there's no separate
 * platform-admin login page), but a Supabase user only counts as a
 * platform admin if a PlatformAdmin row also exists for their
 * supabaseUserId — most authenticated users won't have one. See
 * PlatformAdmin's own doc comment in schema.prisma for why there is
 * deliberately no in-app way to create that row.
 */
export async function resolvePlatformAdminContext(): Promise<PlatformAdminContext | null> {
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

  const admin = await getPlatformDb().platformAdmin.findUnique({ where: { supabaseUserId: user.id } });
  if (!admin) {
    return null;
  }

  return { id: admin.id, email: admin.email, name: admin.name };
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const context = await resolvePlatformAdminContext();
  if (!context) {
    throw new UnauthorizedError("Not a platform admin");
  }
  return context;
}
