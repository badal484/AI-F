export const ROLES = ["OWNER", "ADMIN", "AGENT"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Resolved server-side from the authenticated Supabase session — never
 * accept this shape (especially tenantId) directly from client input.
 */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  userId: string;
  userEmail: string;
  role: Role;
  /** Platform-admin suspension (Phase 13) — resolveTenantContext() still returns a context (not null) for a suspended tenant, so callers can show a real "suspended" message instead of a confusing silent redirect to /login; requireTenantContext()/requireWriteAccess() block on it for everything except that specific messaging. */
  isSuspended: boolean;
  /** White-label branding (Phase 18) — set only when this tenant belongs to an Agency that has configured at least one branding field; null otherwise, meaning "show default branding," never a guessed fallback. Dashboard-only (see Agency's own doc comment in schema.prisma for why the public login/signup pages don't use this). */
  agencyBranding: { name: string; logoUrl: string | null; primaryColor: string | null } | null;
}

export type ActionResult = { error: string } | { success: true };

/** Like ActionResult, but returns the affected record for optimistic-update reconciliation. */
export type DataActionResult<T> = { error: string } | { data: T };
