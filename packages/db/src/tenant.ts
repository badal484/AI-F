import { getBasePrisma } from "./client";

/**
 * Model names (as they appear in the Prisma Client API, i.e. PascalCase
 * model name from schema.prisma) that carry a `tenantId` column and must
 * never be queried without it.
 *
 * Every new tenant-scoped model added to schema.prisma MUST be added here.
 * A model left out of this set is silently NOT isolated by the extension
 * below — this is the single place that decides what "tenant-scoped" means.
 */
const TENANT_SCOPED_MODELS = new Set<string>([
  "User",
  "Location",
  "LocationHours",
  "Service",
  "StaffMember",
]);

/**
 * Models whose own `id` IS the tenant boundary, rather than carrying a
 * separate `tenantId` column — currently just Tenant itself (e.g. reading
 * or updating the current tenant's profile). Only read/update are allowed
 * through this path: Tenant creation happens during sign-up provisioning
 * (before a tenantId exists to scope with, so it goes through
 * getPlatformDb() instead — see apps/web's signUp action) and Tenant
 * deletion isn't supported yet.
 */
const SELF_SCOPED_MODELS = new Set<string>(["Tenant"]);

type Operation =
  | "findUnique"
  | "findUniqueOrThrow"
  | "findFirst"
  | "findFirstOrThrow"
  | "findMany"
  | "create"
  | "createMany"
  | "update"
  | "updateMany"
  | "upsert"
  | "delete"
  | "deleteMany"
  | "count"
  | "aggregate"
  | "groupBy";

/**
 * Returns a Prisma client scoped to a single tenant. Every query issued
 * through the returned client against a model in TENANT_SCOPED_MODELS has
 * `tenantId` injected into its `where` (reads/updates/deletes) or `data`
 * (creates) — the caller cannot override or omit it.
 *
 * This is the ONLY way application code (apps/web, apps/worker) should
 * touch tenant-scoped data. tenantId must be derived server-side from the
 * authenticated session / verified job payload — never trust a tenantId
 * supplied directly by a client request.
 */
export function getTenantDb(tenantId: string) {
  if (!tenantId) {
    throw new Error("getTenantDb() requires a non-empty tenantId");
  }

  return getBasePrisma().$extends({
    name: `tenant-scope:${tenantId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scopedArgs = args as Record<string, unknown>;
          const op = operation as Operation;

          if (SELF_SCOPED_MODELS.has(model)) {
            switch (op) {
              case "findUnique":
              case "findUniqueOrThrow":
              case "findFirst":
              case "findFirstOrThrow":
              case "findMany":
              case "count":
                scopedArgs.where = { ...(scopedArgs.where as object | undefined), id: tenantId };
                return query(scopedArgs);
              case "update":
                scopedArgs.where = { ...(scopedArgs.where as object | undefined), id: tenantId };
                return query(scopedArgs);
              default:
                throw new Error(
                  `getTenantDb() does not support ${operation} on ${model} — only reads and update are allowed on the tenant's own profile`,
                );
            }
          }

          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          switch (op) {
            case "findUnique":
            case "findUniqueOrThrow":
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "update":
            case "updateMany":
            case "delete":
            case "deleteMany":
            case "count":
            case "aggregate":
            case "groupBy":
              scopedArgs.where = { ...(scopedArgs.where as object | undefined), tenantId };
              break;

            case "create":
              scopedArgs.data = { ...(scopedArgs.data as object | undefined), tenantId };
              break;

            case "createMany":
              if (Array.isArray(scopedArgs.data)) {
                scopedArgs.data = (scopedArgs.data as Record<string, unknown>[]).map((d) => ({
                  ...d,
                  tenantId,
                }));
              }
              break;

            case "upsert":
              scopedArgs.where = { ...(scopedArgs.where as object | undefined), tenantId };
              scopedArgs.create = { ...(scopedArgs.create as object | undefined), tenantId };
              scopedArgs.update = { ...(scopedArgs.update as object | undefined), tenantId };
              break;
          }

          return query(scopedArgs);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof getTenantDb>;

/**
 * Cross-tenant access for platform-admin operations ONLY (Phase 13 —
 * Platform Admin Dashboard). Deliberately named and imported differently
 * from getTenantDb() so any cross-tenant read/write is visually obvious
 * in a diff or code review. Application code serving a tenant-scoped
 * request must NEVER use this.
 */
export function getPlatformDb() {
  return getBasePrisma();
}
