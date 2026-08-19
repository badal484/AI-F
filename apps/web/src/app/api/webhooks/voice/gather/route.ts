import { NextResponse, type NextRequest } from "next/server";
import { getPlatformDb, getTenantDb, Prisma } from "@aif/db";
import { draftReply, isAiConfigured } from "@aif/ai";
import { verifyTwilioSignature, buildGatherResponse, buildHangupResponse } from "@aif/voice";
import { createLogger } from "@aif/shared";

const logger = createLogger("web:webhooks:voice:gather");

const NO_INPUT_MESSAGE = "Sorry, I didn't catch that. Could you say that again?";
const AI_UNAVAILABLE_MESSAGE =
  "Sorry, our automated assistant is temporarily unavailable. Please try again later or reach us another way.";
const ESCALATED_MESSAGE = "Thanks — I've noted that down for our team, and someone will follow up with you soon. Have a great day!";
const UNKNOWN_CALL_MESSAGE = "Sorry, something went wrong on our end. Please call back in a moment.";
// A phone conversation costs real per-minute money on both Twilio's and
// the AI provider's side (unlike the free website widget), so an
// unbounded loop is worth capping even without the more elaborate
// per-visitor/per-tenant rate limiting Phase 14 built for the widget.
const MAX_TURNS = 15;
const MAX_TURNS_MESSAGE = "We've covered a lot — let's continue this over a message instead so I can follow up properly. Thanks for calling!";

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function originOf(request: NextRequest): string {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

function xmlResponse(body: string): NextResponse {
  return new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
}

/**
 * Twilio's callback after each <Gather> — one call to this route per turn
 * of the conversation. `conversationId` lives in the action URL's query
 * string (set by the previous turn, or by /incoming for the first one),
 * not the POST body — safe to trust because Twilio's signature covers the
 * full URL including query string, so it can't be tampered with in
 * transit without invalidating the signature (same reasoning the website
 * widget route documents for tenantId in its own URL path). The CallSid
 * cross-check below is cheap extra defense-in-depth on top, not the
 * actual security boundary.
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

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const turn = Number(request.nextUrl.searchParams.get("turn") ?? "1");
  const callSid = params.CallSid;
  const speechResult = params.SpeechResult?.trim();

  if (!conversationId) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const conversationRef = await getPlatformDb().conversation.findUnique({
    where: { id: conversationId },
    select: { tenantId: true, voiceCallSid: true, status: true },
  });

  if (!conversationRef || conversationRef.voiceCallSid !== callSid) {
    logger.warn({ conversationId, callSid }, "Voice gather callback for an unknown/mismatched conversation");
    return xmlResponse(buildHangupResponse({ sayText: UNKNOWN_CALL_MESSAGE }));
  }

  const db = getTenantDb(conversationRef.tenantId);
  const nextActionUrl = `${origin}/api/webhooks/voice/gather?conversationId=${conversationId}&turn=${turn + 1}`;

  if (!speechResult) {
    return xmlResponse(buildGatherResponse({ sayText: NO_INPUT_MESSAGE, actionUrl: nextActionUrl }));
  }

  if (turn > MAX_TURNS) {
    return xmlResponse(buildHangupResponse({ sayText: MAX_TURNS_MESSAGE }));
  }

  let customerMessage;
  try {
    customerMessage = await db.message.create({
      data: {
        tenantId: conversationRef.tenantId,
        conversationId,
        senderType: "CUSTOMER",
        body: speechResult,
        // Synthetic idempotency key — Twilio has no message-id concept
        // for a single Gather result the way WhatsApp has wamid, so
        // CallSid+turn (already threaded through the action URL for the
        // turn-limit above) stands in for one, reusing Message's existing
        // @@unique([tenantId, externalId]) guard rather than adding new
        // schema (MASTER_INSTRUCTIONS.md's webhook idempotency mandate).
        externalId: `voice:${callSid}:${turn}`,
      },
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      // A retried callback for a turn we already processed. Rather than
      // reconstructing and re-saying whatever AI reply we already gave
      // (which would need looking up and replaying prior output), ask the
      // caller to repeat — a minor UX hiccup in a rare retry case, far
      // better than double-processing (and double-billing) the same turn.
      logger.info({ conversationId, callSid, turn }, "Duplicate voice gather callback — already processed, skipping");
      return xmlResponse(buildGatherResponse({ sayText: NO_INPUT_MESSAGE, actionUrl: nextActionUrl }));
    }
    throw err;
  }
  await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: customerMessage.createdAt } });

  if (conversationRef.status === "HUMAN_REQUIRED") {
    return xmlResponse(buildHangupResponse({ sayText: ESCALATED_MESSAGE }));
  }

  if (!isAiConfigured()) {
    logger.warn({ tenantId: conversationRef.tenantId }, "Voice call received but AI is NOT CONFIGURED");
    return xmlResponse(buildHangupResponse({ sayText: AI_UNAVAILABLE_MESSAGE }));
  }

  const history = await db.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });

  const draft = await draftReply({
    tenantId: conversationRef.tenantId,
    conversationId,
    history: history.map((m) => ({
      role: m.senderType === "CUSTOMER" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    })),
    latestCustomerMessageId: customerMessage.id,
  });

  // No live phone transfer to a human exists — hanging up with a "someone
  // will follow up" message is the honest equivalent: the conversation is
  // now HUMAN_REQUIRED (set by the escalateToHuman tool) and visible in
  // the Inbox for staff, but we never pretend to connect the call to a
  // person who isn't there (MASTER_INSTRUCTIONS.md §7).
  if (draft.escalated) {
    return xmlResponse(buildHangupResponse({ sayText: ESCALATED_MESSAGE }));
  }

  const aiMessage = await db.message.create({
    data: { tenantId: conversationRef.tenantId, conversationId, senderType: "AI", body: draft.text },
  });
  await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: aiMessage.createdAt } });

  return xmlResponse(buildGatherResponse({ sayText: draft.text, actionUrl: nextActionUrl }));
}
