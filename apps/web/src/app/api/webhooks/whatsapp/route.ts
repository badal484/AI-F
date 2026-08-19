import { NextResponse, type NextRequest } from "next/server";
import { getPlatformDb } from "@aif/db";
import { enqueueWhatsAppInbound, isRedisConfigured } from "@aif/queue";
import { verifyWebhookHandshake, verifyWebhookSignature, parseInboundWebhook } from "@aif/whatsapp";
import { createLogger, logNotConfigured } from "@aif/shared";

const logger = createLogger("web:webhooks:whatsapp");

/** Meta's webhook subscription verification handshake. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const challenge = verifyWebhookHandshake(
    searchParams.get("hub.mode"),
    searchParams.get("hub.verify_token"),
    searchParams.get("hub.challenge"),
  );

  if (!challenge) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

/**
 * Receives inbound WhatsApp events. Verifies Meta's signature against the
 * raw body, resolves which tenant the message is for (by the receiving
 * phone_number_id — this is the one place besides sign-up and Platform
 * Admin that legitimately uses getPlatformDb(): a webhook has no
 * Supabase session to resolve a tenant from, and the signature check
 * above is what makes trusting the payload's claimed phone_number_id
 * safe), then enqueues the actual processing for apps/worker rather than
 * doing it inline — webhook handlers must ack fast, and AI/DB work
 * belongs on the long-running worker per MASTER_INSTRUCTIONS.md's hybrid
 * deployment architecture. Always acks 200 once the signature checks out,
 * even for events we can't map to a tenant or don't otherwise process —
 * Meta retries non-2xx responses, which would just repeat a problem we
 * already logged.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn("Rejected WhatsApp webhook — invalid or missing signature (or WhatsApp is NOT CONFIGURED)");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const messages = parseInboundWebhook(payload);
  if (messages.length === 0) {
    return NextResponse.json({ status: "ok" });
  }

  if (!isRedisConfigured()) {
    logNotConfigured(logger, "Redis", ["REDIS_URL"]);
    return NextResponse.json({ status: "ok" });
  }

  for (const message of messages) {
    const tenant = await getPlatformDb().tenant.findUnique({
      where: { whatsappPhoneNumberId: message.phoneNumberId },
      select: { id: true },
    });

    if (!tenant) {
      logger.warn({ phoneNumberId: message.phoneNumberId }, "No tenant registered for this WhatsApp phone_number_id");
      continue;
    }

    await enqueueWhatsAppInbound({
      tenantId: tenant.id,
      phoneNumberId: message.phoneNumberId,
      fromPhoneNumber: message.fromPhoneNumber,
      contactName: message.contactName,
      waMessageId: message.waMessageId,
      text: message.text,
      timestamp: message.timestamp,
    });
  }

  return NextResponse.json({ status: "ok" });
}
