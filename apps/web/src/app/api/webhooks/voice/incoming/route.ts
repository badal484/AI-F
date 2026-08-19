import { NextResponse, type NextRequest } from "next/server";
import { getPlatformDb, getTenantDb } from "@aif/db";
import { verifyTwilioSignature, buildGatherResponse, buildHangupResponse } from "@aif/voice";
import { createLogger } from "@aif/shared";

const logger = createLogger("web:webhooks:voice:incoming");

const UNAVAILABLE_MESSAGE = "Sorry, this number isn't taking calls right now. Please try again later.";
const GREETING = "Thanks for calling! How can I help you today?";

function originOf(request: NextRequest): string {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

/**
 * Twilio's webhook for a freshly-answered inbound call — configured as
 * the phone number's "A call comes in" URL in the Twilio console. Resolves
 * the tenant by the dialed "To" number (getPlatformDb() — a phone call
 * has no session, and Twilio's request signature is what makes trusting
 * the claimed To/From/CallSid safe, same role X-Hub-Signature-256/
 * Stripe-Signature play for their own webhooks), starts a real
 * Conversation, and returns TwiML that greets the caller and starts
 * listening for their first turn.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params = Object.fromEntries(formData) as Record<string, string>;
  const origin = originOf(request);
  const url = `${origin}${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (!verifyTwilioSignature(url, params, request.headers.get("x-twilio-signature"))) {
    logger.warn("Rejected voice webhook — invalid or missing signature (or Twilio is NOT CONFIGURED)");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const callSid = params.CallSid;
  const from = params.From;
  const to = params.To;

  const tenant = await getPlatformDb().tenant.findUnique({
    where: { voicePhoneNumber: to },
    select: { id: true, isSuspended: true },
  });

  if (!tenant || tenant.isSuspended) {
    logger.warn({ to }, "No active tenant registered for this Twilio voice number");
    return new NextResponse(buildHangupResponse({ sayText: UNAVAILABLE_MESSAGE }), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const db = getTenantDb(tenant.id);

  // Exact phone match only — same documented limitation as WhatsApp's
  // inbound worker (no E.164 normalization/fuzzy matching).
  let customer = await db.customer.findFirst({ where: { phone: from } });
  if (!customer) {
    customer = await db.customer.create({ data: { tenantId: tenant.id, name: from, phone: from } });
  }

  const conversation = await db.conversation.create({
    data: { tenantId: tenant.id, customerId: customer.id, channel: "VOICE", voiceCallSid: callSid },
  });

  const actionUrl = `${origin}/api/webhooks/voice/gather?conversationId=${conversation.id}&turn=1`;

  return new NextResponse(buildGatherResponse({ sayText: GREETING, actionUrl }), {
    headers: { "Content-Type": "text/xml" },
  });
}
