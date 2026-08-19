import Stripe from "stripe";
import { getStripeClient, isStripeWebhookConfigured } from "./client";

/**
 * Verifies Stripe's signature (`Stripe-Signature` header) against the raw
 * request body and parses the event in one step — Stripe's SDK does both
 * atomically (unlike Meta's separate HMAC-check-then-JSON.parse), so
 * there's no equivalent of packages/whatsapp's split
 * verifyWebhookSignature()/parseInboundWebhook(). Returns null (never
 * throws) on any verification failure, matching the same
 * reject-and-return-401 pattern the WhatsApp webhook route uses.
 */
export async function verifyAndParseWebhookEvent(rawBody: string, signatureHeader: string | null): Promise<Stripe.Event | null> {
  if (!isStripeWebhookConfigured() || !signatureHeader) return null;
  const stripe = getStripeClient();
  try {
    return await stripe.webhooks.constructEventAsync(rawBody, signatureHeader, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return null;
  }
}
