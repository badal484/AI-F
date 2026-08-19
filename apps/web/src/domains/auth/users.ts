"use server";

import { getTenantDb } from "@aif/db";
import type { DataActionResult } from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";

export type AssignableUser = { id: string; name: string | null; email: string };

/**
 * Dashboard users a Lead or Conversation can be assigned to. Lives in the
 * auth domain (not crm or inbox) since it's fundamentally "list this
 * tenant's staff accounts" — both domains depend on it, neither owns it.
 */
export async function listAssignableUsers(): Promise<DataActionResult<AssignableUser[]>> {
  try {
    const context = await requireTenantContext();
    const users = await getTenantDb(context.tenantId).user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    });
    return { data: users };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
