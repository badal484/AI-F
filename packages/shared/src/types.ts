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
}

export type ActionResult = { error: string } | { success: true };

/** Like ActionResult, but returns the affected record for optimistic-update reconciliation. */
export type DataActionResult<T> = { error: string } | { data: T };
