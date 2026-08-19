import { NextResponse, type NextRequest } from "next/server";
import { getPlatformDb, getTenantDb } from "@aif/db";
import { draftReply, isAiConfigured } from "@aif/ai";
import { widgetMessageSchema, createLogger } from "@aif/shared";

const logger = createLogger("web:api:widget:message");

const AI_UNAVAILABLE_REPLY =
  "Thanks for your message — we've received it and someone from our team will follow up soon.";
const ESCALATED_REPLY = "Thanks — I've flagged this for a team member, who'll follow up with you shortly.";

/**
 * Building the CORS response headers requires knowing the *validated*
 * origin (never echo back the request's Origin unless it's actually on
 * this tenant's allowlist) — shared between OPTIONS (preflight) and POST
 * so both respond identically.
 */
function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

/**
 * Resolves the tenant (via getPlatformDb() — no session exists for a
 * widget visitor, see that function's doc comment for why this is one of
 * its few sanctioned uses) and checks the request's Origin against that
 * tenant's own widgetEnabled/widgetAllowedOrigins. Returns the validated
 * origin string on success, or null if the request should be rejected —
 * deliberately generic (doesn't distinguish "tenant not found" from
 * "origin not allowed" to the caller) so this endpoint doesn't leak which
 * tenantIds exist.
 */
async function resolveAllowedOrigin(tenantId: string, originHeader: string | null): Promise<string | null> {
  if (!originHeader) return null;
  const tenant = await getPlatformDb().tenant.findUnique({
    where: { id: tenantId },
    select: { widgetEnabled: true, widgetAllowedOrigins: true, isSuspended: true },
  });
  if (!tenant || !tenant.widgetEnabled || tenant.isSuspended) return null;
  if (!tenant.widgetAllowedOrigins.includes(originHeader)) return null;
  return originHeader;
}

/**
 * CORS preflight. tenantId comes from the URL path (not the request body)
 * specifically so it's available here — a preflight OPTIONS request never
 * carries the POST body, so origin validation has to be per-tenant using
 * only what's in the path/headers at this point.
 */
export async function OPTIONS(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const origin = await resolveAllowedOrigin(tenantId, request.headers.get("origin"));
  if (!origin) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * Receives one website-widget chat message, replies synchronously (unlike
 * the WhatsApp webhook's enqueue-and-ack pattern — there's no third-party
 * redelivery concern here, and the visitor's browser is waiting on this
 * response to render a reply, so there's nothing to gain from a queue).
 * Re-validates Origin independently of the OPTIONS preflight above —
 * never trust that a browser actually honored its own preflight result,
 * same defense-in-depth reasoning as getTenantDb()'s injected tenantId
 * alongside an explicit one at call sites.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const origin = await resolveAllowedOrigin(tenantId, request.headers.get("origin"));
  if (!origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const headers = corsHeaders(origin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers });
  }

  const parsed = widgetMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400, headers },
    );
  }
  const { visitorId, message } = parsed.data;

  const db = getTenantDb(tenantId);

  let conversation = await db.conversation.findFirst({
    where: { widgetVisitorId: visitorId, channel: "WEBSITE", status: { not: "CLOSED" } },
    orderBy: { createdAt: "desc" },
  });
  if (!conversation) {
    conversation = await db.conversation.create({
      data: { tenantId, channel: "WEBSITE", widgetVisitorId: visitorId },
    });
  }

  const customerMessage = await db.message.create({
    data: { tenantId, conversationId: conversation.id, senderType: "CUSTOMER", body: message },
  });
  await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: customerMessage.createdAt },
  });

  if (conversation.status === "HUMAN_REQUIRED") {
    return NextResponse.json({ reply: ESCALATED_REPLY }, { headers });
  }

  if (!isAiConfigured()) {
    logger.warn({ tenantId }, "Widget message received but AI is NOT CONFIGURED — replying with fallback text");
    return NextResponse.json({ reply: AI_UNAVAILABLE_REPLY }, { headers });
  }

  const history = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });

  const draft = await draftReply({
    tenantId,
    conversationId: conversation.id,
    history: history.map((m) => ({
      role: m.senderType === "CUSTOMER" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    })),
  });

  if (draft.escalated) {
    return NextResponse.json({ reply: ESCALATED_REPLY }, { headers });
  }

  const aiMessage = await db.message.create({
    data: { tenantId, conversationId: conversation.id, senderType: "AI", body: draft.text },
  });
  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: aiMessage.createdAt } });

  return NextResponse.json({ reply: draft.text }, { headers });
}
