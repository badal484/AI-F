import type { TenantDb } from "@aif/db";

/**
 * tagIds come from client input and are attached via a nested relation
 * write (`tags: { connect/set: ... } }`), which getTenantDb()'s extension
 * does NOT auto-scope (see the warning in packages/db/src/tenant.ts) — so
 * every tag id must be confirmed to belong to this tenant before use.
 */
export async function assertTagsBelongToTenant(tenantDb: TenantDb, tagIds: string[]): Promise<boolean> {
  if (tagIds.length === 0) return true;
  const count = await tenantDb.tag.count({ where: { id: { in: tagIds } } });
  return count === tagIds.length;
}
