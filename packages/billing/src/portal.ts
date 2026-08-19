import { getStripeClient } from "./client";

/**
 * The Stripe-hosted Customer Portal — payment method changes, invoice
 * history, and self-service cancellation all happen there, not in this
 * app's own UI. Deliberate: building card-management UI ourselves would
 * pull this app into PCI scope for no real benefit over Stripe's own,
 * already-compliant, hosted page.
 */
export async function createPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  return { url: session.url };
}
