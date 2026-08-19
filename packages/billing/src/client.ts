import Stripe from "stripe";

/**
 * Pinned explicitly rather than left to the SDK's own default — confirmed
 * current for stripe@22.5.0 by reading its own generated type defs
 * (node_modules/stripe/esm/apiVersion.d.ts) rather than assuming, since
 * Stripe's API versioning genuinely drifts release to release (this repo
 * follows the same discipline for Meta's Graph API version — see
 * packages/whatsapp). Re-verify against that same file before relying on
 * this if the `stripe` dependency is ever upgraded.
 */
const STRIPE_API_VERSION = "2026-07-29.dahlia" as const;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function missingStripeEnvVars(): string[] {
  return [!process.env.STRIPE_SECRET_KEY && "STRIPE_SECRET_KEY"].filter((v): v is string => Boolean(v));
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

let client: Stripe | undefined;

/**
 * Lazily constructs the Stripe client on first use, not at module import
 * time, so importing this module never fails just because
 * STRIPE_SECRET_KEY isn't set yet — callers must check
 * isStripeConfigured() first, same NOT CONFIGURED discipline as every
 * other integration (MASTER_INSTRUCTIONS.md §7).
 */
export function getStripeClient(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error(`Stripe is NOT CONFIGURED — set ${missingStripeEnvVars().join(", ")}`);
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION });
  }
  return client;
}
