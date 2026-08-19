import twilio from "twilio";

/**
 * Verifies Twilio's `X-Twilio-Signature` header — an HMAC over the exact
 * webhook URL (including query string) plus the POST form params,
 * computed with the account's Auth Token. This is what makes it safe to
 * trust an incoming call/gather webhook's claimed CallSid/From/To without
 * a logged-in session — the same role WHATSAPP_APP_SECRET/
 * STRIPE_WEBHOOK_SECRET play for their own webhooks. Uses the official
 * `twilio` package's own `validateRequest` rather than reimplementing the
 * HMAC scheme by hand.
 */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signatureHeader: string | null): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signatureHeader) return false;
  return twilio.validateRequest(authToken, signatureHeader, url, params);
}
