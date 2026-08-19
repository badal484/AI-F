import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_API_VERSION = "v25.0";

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_APP_SECRET);
}

export function missingWhatsAppEnvVars(): string[] {
  return [
    !process.env.WHATSAPP_ACCESS_TOKEN && "WHATSAPP_ACCESS_TOKEN",
    !process.env.WHATSAPP_APP_SECRET && "WHATSAPP_APP_SECRET",
  ].filter((v): v is string => Boolean(v));
}

function apiVersion(): string {
  return process.env.WHATSAPP_API_VERSION ?? DEFAULT_API_VERSION;
}

/**
 * Renders a template's `{{1}}`, `{{2}}`, ... placeholders with `params`
 * positionally, for display purposes only (e.g. the internal Message row
 * created alongside an actual template send) — the real send still goes
 * through Meta's own template rendering via `template.components`.
 */
export function renderTemplateBody(bodyText: string, params: string[]): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (match, index: string) => {
    const value = params[Number(index) - 1];
    return value ?? match;
  });
}

function accessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    throw new Error("WhatsApp is NOT CONFIGURED — set WHATSAPP_ACCESS_TOKEN");
  }
  return token;
}

/**
 * Verifies Meta's `X-Hub-Signature-256` header against the raw request
 * body — this is what makes it safe to trust a webhook's contents (e.g.
 * which tenant's phone_number_id it claims to be for) without a logged-in
 * session. Compares with a constant-time check to avoid a timing attack.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Meta's webhook subscription verification handshake (GET request with
 * hub.mode/hub.verify_token/hub.challenge). Returns the challenge string
 * to echo back if it checks out, or null if it should be rejected (403).
 */
export function verifyWebhookHandshake(
  mode: string | null,
  token: string | null,
  challenge: string | null,
): string | null {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken || mode !== "subscribe" || token !== verifyToken || !challenge) {
    return null;
  }
  return challenge;
}

async function callGraphApi(phoneNumberId: string, body: unknown): Promise<{ id: string }> {
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion()}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken()}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp API request failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as { messages?: Array<{ id: string }> };
  const id = data.messages?.[0]?.id;
  if (!id) {
    throw new Error("WhatsApp API response did not include a message id");
  }
  return { id };
}

/**
 * Sends a free-form text message. Only valid within Meta's 24-hour
 * customer-service window after the customer's last message — outside
 * that window Meta will reject this and a template message must be used
 * instead (sendTemplateMessage). Throws if NOT CONFIGURED; callers must
 * check isWhatsAppConfigured() first per MASTER_INSTRUCTIONS.md §7.
 */
export async function sendTextMessage(
  phoneNumberId: string,
  to: string,
  body: string,
): Promise<{ id: string }> {
  if (!isWhatsAppConfigured()) {
    throw new Error(`WhatsApp is NOT CONFIGURED — set ${missingWhatsAppEnvVars().join(", ")}`);
  }
  return callGraphApi(phoneNumberId, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body },
  });
}

/**
 * Sends a pre-approved template message — required outside the 24-hour
 * window, since Meta rejects free-form text there. `bodyParams` fill the
 * template's body placeholders ({{1}}, {{2}}, ...) in order.
 */
export async function sendTemplateMessage(
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[],
): Promise<{ id: string }> {
  if (!isWhatsAppConfigured()) {
    throw new Error(`WhatsApp is NOT CONFIGURED — set ${missingWhatsAppEnvVars().join(", ")}`);
  }
  return callGraphApi(phoneNumberId, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components:
        bodyParams.length > 0
          ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
          : [],
    },
  });
}
