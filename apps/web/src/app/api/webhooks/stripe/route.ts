import { NextResponse, type NextRequest } from "next/server";
import { getPlatformDb, getTenantDb } from "@aif/db";
import {
  verifyAndParseWebhookEvent,
  getPlanTierForPriceId,
  mapStripeSubscriptionStatus,
  getStripeClient,
  type Stripe,
} from "@aif/billing";
import { createLogger } from "@aif/shared";

const logger = createLogger("web:webhooks:stripe");

async function findTenantIdByCustomerId(customerId: string): Promise<string | null> {
  const tenant = await getPlatformDb().tenant.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  return tenant?.id ?? null;
}

/**
 * Upserts one tenant's Subscription row from a real Stripe Subscription
 * object — keyed on tenantId (which is `@unique` on Subscription), so
 * replaying the same event just re-writes the same target state. This IS
 * the idempotency strategy for this webhook (MASTER_INSTRUCTIONS.md
 * §"Idempotency") — see Subscription's own doc comment in schema.prisma
 * for why no separate processed-event-id table is needed here, unlike
 * WhatsApp's Message.externalId dedup.
 */
async function upsertSubscription(tenantId: string, sub: Stripe.Subscription): Promise<void> {
  const item = sub.items.data[0];
  if (!item) {
    logger.error({ tenantId, stripeSubscriptionId: sub.id }, "Stripe subscription has no line items — skipping");
    return;
  }
  const priceId = item.price.id;
  const planTier = getPlanTierForPriceId(priceId);
  if (!planTier) {
    logger.error({ tenantId, priceId }, "Subscription's price id doesn't match any configured plan — skipping");
    return;
  }
  const status = mapStripeSubscriptionStatus(sub.status);
  if (!status) {
    logger.error({ tenantId, status: sub.status }, "Unrecognized Stripe subscription status — skipping");
    return;
  }

  const data = {
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    planTier,
    status,
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };

  await getTenantDb(tenantId).subscription.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });
}

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string {
  return typeof customer === "string" ? customer : customer.id;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const event = await verifyAndParseWebhookEvent(rawBody, request.headers.get("stripe-signature"));

  if (!event) {
    logger.warn("Rejected Stripe webhook — invalid or missing signature (or Stripe is NOT CONFIGURED)");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const tenantId = session.client_reference_id;
        if (!tenantId || !session.subscription) break;

        const stripe = getStripeClient();
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription(tenantId, subscription);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const tenantId = await findTenantIdByCustomerId(customerIdOf(subscription.customer));
        if (!tenantId) {
          logger.warn({ stripeCustomerId: customerIdOf(subscription.customer) }, "No tenant registered for this Stripe customer");
          break;
        }
        await upsertSubscription(tenantId, subscription);
        break;
      }
      default:
        // Every other event type is acknowledged but intentionally
        // ignored — this webhook only needs to track subscription state,
        // not e.g. individual invoice line items.
        break;
    }
  } catch (err) {
    logger.error({ err, eventType: event.type }, "Failed to process Stripe webhook event");
    // Ack 200 anyway: Stripe retries non-2xx responses, which would just
    // repeat a problem already logged — same reasoning as the WhatsApp
    // webhook route.
  }

  return NextResponse.json({ received: true });
}
