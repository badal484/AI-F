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
  "Customer",
  "Lead",
  "Tag",
  "Conversation",
  "Message",
  "KnowledgeDocument",
  "DocumentChunk",
  "Appointment",
  "WhatsAppTemplate",
  "AutomationRule",
  "AutomationRun",
  "Reminder",
  "AiInteractionLog",
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
 *
 * IMPORTANT LIMITATION: this only scopes the TOP-LEVEL operation's own
 * `where`/`data`. A nested relation write inside `data` — e.g.
 * `customer.update({ data: { tags: { connect: [{ id: tagId }] } } })` — is
 * NOT automatically checked against the tenant. Any call site accepting a
 * foreign id from input (a locationId, tagIds, customerId, assignedToId,
 * ...) MUST separately verify that id resolves through THIS SAME
 * getTenantDb(tenantId) client before using it in a nested write, or a
 * caller could attach another tenant's row by id. See
 * `assertLocationBelongsToTenant()` in
 * apps/web/src/domains/business-core/staff/actions.ts for the pattern.
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
 * Cross-tenant access, restricted to a short, deliberate list of legitimate
 * uses where no tenantId/session exists yet to scope with: (1) resolving
 * which tenant a bare Supabase session belongs to; (2) the Platform Admin
 * Dashboard (Phase 13); (3) resolving which tenant an inbound WhatsApp
 * webhook is for, by its phone_number_id — a webhook has no session, and
 * the X-Hub-Signature-256 check is what makes trusting that lookup safe;
 * (4) resolving which tenant a website widget message is for, by the
 * tenantId in its URL path — a widget visitor has no session either, and
 * the Origin-header check against that tenant's own widgetAllowedOrigins
 * is what makes trusting it safe (see apps/web's /api/widget/[tenantId]
 * route). In every case, getPlatformDb() is used ONLY for that initial
 * identity resolution — the actual read/write work that follows switches
 * to getTenantDb(tenantId) once the tenantId is confirmed legitimate.
 * Deliberately named and imported differently from getTenantDb() so any
 * cross-tenant access is visually obvious in a diff or code review.
 * Application code serving an already-tenant-scoped request must NEVER
 * use this.
 */
export function getPlatformDb() {
  return getBasePrisma();
}
