import { getStripeClient } from "./client";

/**
 * Creates (or reuses, if `existingCustomerId` is given) a Stripe Customer
 * for a tenant — deliberately a separate, synchronous step from creating
 * the Checkout Session, called by the Server Action before redirecting to
 * Stripe, so `Tenant.stripeCustomerId` is saved to our DB immediately
 * rather than waiting on a webhook. This closes an ordering gap: Stripe
 * doesn't guarantee webhook delivery order, so if `stripeCustomerId` were
 * only ever set by a webhook, a `customer.subscription.updated` event
 * could arrive before the checkout-completion event that would have set
 * it, and have no tenant to attach to.
 */
export async function getOrCreateStripeCustomer(params: {
  existingCustomerId: string | null;
  tenantId: string;
  email: string;
  name: string;
}): Promise<string> {
  const stripe = getStripeClient();
  if (params.existingCustomerId) {
    return params.existingCustomerId;
  }
  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: { tenantId: params.tenantId },
  });
  return customer.id;
}

export async function createCheckoutSession(params: {
  tenantId: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    client_reference_id: params.tenantId,
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
  if (!session.url) {
    throw new Error("Stripe did not return a Checkout Session URL");
  }
  return { url: session.url };
}
