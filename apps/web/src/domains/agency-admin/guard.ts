import "server-only";
import { getPlatformDb } from "@aif/db";
import { createClient } from "@/lib/supabase/server";
import { isDatabaseConfigured, isSupabaseConfigured } from "@/lib/env";
import { UnauthorizedError } from "@/domains/auth/guard";

export interface AgencyAdminContext {
  id: string;
  agencyId: string;
  email: string;
  name: string | null;
}

/**
 * Resolves the current request's AgencyAdmin identity — narrower than
 * requirePlatformAdmin() (scoped to one Agency's own Tenants, not every
 * Tenant on the deployment) but otherwise the same shape and the same
 * reasoning: reuses the tenant Users' Supabase session (no separate
 * agency-admin login page), and a Supabase user only counts as an agency
 * admin if an AgencyAdmin row also exists for their supabaseUserId. See
 * AgencyAdmin's own doc comment in schema.prisma for why there is
 * deliberately no in-app way to create that row.
 */
export async function resolveAgencyAdminContext(): Promise<AgencyAdminContext | null> {
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

  const admin = await getPlatformDb().agencyAdmin.findUnique({ where: { supabaseUserId: user.id } });
  if (!admin) {
    return null;
  }

  return { id: admin.id, agencyId: admin.agencyId, email: admin.email, name: admin.name };
}

export async function requireAgencyAdmin(): Promise<AgencyAdminContext> {
  const context = await resolveAgencyAdminContext();
  if (!context) {
    throw new UnauthorizedError("Not an agency admin");
  }
  return context;
}
