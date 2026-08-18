import "server-only";
import type { Role, TenantContext } from "@aif/shared";
import { resolveTenantContext } from "./session";

export class UnauthorizedError extends Error {}

export async function requireTenantContext(): Promise<TenantContext> {
  const context = await resolveTenantContext();
  if (!context) {
    throw new UnauthorizedError("Not authenticated");
  }
  return context;
}

const WRITE_ROLES: Role[] = ["OWNER", "ADMIN"];

/**
 * Business-core mutations (tenant profile, locations, services, staff) are
 * restricted to OWNER/ADMIN — AGENT is a lower-privilege staff role meant
 * for day-to-day conversation/booking handling, not configuring the
 * business.
 */
export async function requireWriteAccess(): Promise<TenantContext> {
  const context = await requireTenantContext();
  if (!WRITE_ROLES.includes(context.role)) {
    throw new UnauthorizedError("Insufficient permissions");
  }
  return context;
}
