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
  "Subscription",
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
            // Neither tenant-scoped nor self-scoped — e.g. PlatformAdmin
            // (Phase 13) or the still-inert Agency — genuinely has no
            // tenantId to inject, so silently passing the query through
            // unscoped would let a getTenantDb(tenantId) client read/write
            // platform-wide data by accident (a typo away from a real
            // isolation leak). Refuse instead: these models are only ever
            // legitimate through getPlatformDb().
            throw new Error(
              `getTenantDb() cannot query "${model}" — it isn't a tenant-scoped model. Use getPlatformDb() instead if this is intentional, or add "${model}" to TENANT_SCOPED_MODELS if it should have been tenant-scoped.`,
            );
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
 * uses. Three shapes of use:
 *
 * Identity resolution — no tenantId/session exists yet to scope with, so
 * getPlatformDb() is used ONLY to resolve one, and the actual read/write
 * work that follows switches to getTenantDb(tenantId) once it's confirmed
 * legitimate: (1) resolving which tenant a bare Supabase session belongs
 * to; (2) resolving which tenant an inbound WhatsApp webhook is for, by
 * its phone_number_id — a webhook has no session, and the
 * X-Hub-Signature-256 check is what makes trusting that lookup safe; (3)
 * resolving which tenant a website widget message is for, by the tenantId
 * in its URL path — a widget visitor has no session either, and the
 * Origin-header check against that tenant's own widgetAllowedOrigins is
 * what makes trusting it safe (see apps/web's /api/widget/[tenantId]
 * route); (4) resolving which tenant a Stripe webhook event is for, by the
 * Stripe customer id on the event — a Stripe webhook has no session
 * either, and Stripe's own signature check (verifyAndParseWebhookEvent,
 * packages/billing) is what makes trusting the event's claimed customer
 * id safe (see apps/web's /api/webhooks/stripe route); (5) resolving which
 * tenant an inbound Twilio call is for, by the dialed "To" number, and —
 * for that same call's later turns — which tenant a Conversation id
 * (carried in a Twilio-signature-covered URL) belongs to, both trusted
 * because of Twilio's own request-signature check (see apps/web's
 * /api/webhooks/voice routes).
 *
 * Genuinely cross-tenant reporting/admin, which does NOT switch to
 * getTenantDb() afterward — the cross-tenant list itself is the point, not
 * a stepping stone to a single tenantId: (6) the Platform Admin Dashboard
 * (Phase 13, apps/web's /platform-admin routes), gated by
 * requirePlatformAdmin(), seeing every Tenant on the deployment; (7) the
 * Agency Admin Dashboard (Phase 18, apps/web's /agency-admin routes),
 * gated by requireAgencyAdmin(), seeing only the Tenants belonging to one
 * Agency — narrower than Platform Admin, but the SAME access pattern
 * (getPlatformDb(), since AgencyAdmin/Agency are neither tenant-scoped nor
 * self-scoped either), with every query manually filtered by agencyId at
 * the call site rather than by any Prisma-extension-level enforcement —
 * see AgencyAdmin's own doc comment in schema.prisma.
 *
 * A fourth shape, provisioning, deliberately does NOT exist through the
 * app at all: there is no self-serve or in-app way to create a
 * PlatformAdmin or AgencyAdmin row (both require direct DB access) —
 * exposing one would be a privilege-escalation path, since either grants
 * real cross-tenant reach. See docs/ARCHITECTURE.md's "Platform Admin
 * Dashboard" and "White-Label / Reseller Architecture" sections.
 *
 * Deliberately named and imported differently from getTenantDb() so any
 * cross-tenant access is visually obvious in a diff or code review.
 * Application code serving an already-tenant-scoped request must NEVER
 * use this.
 */
export function getPlatformDb() {
  return getBasePrisma();
}
