export interface ParsedInboundMessage {
  phoneNumberId: string;
  fromPhoneNumber: string;
  contactName?: string;
  waMessageId: string;
  text: string;
  timestamp: string;
}

/**
 * Extracts text messages from a WhatsApp Cloud API webhook payload.
 * Phase 8's baseline only handles `type: "text"` — other message types
 * (image, audio, location, button replies, message-status updates, etc.)
 * are silently skipped rather than guessed at or partially handled. A
 * single delivery can contain multiple entries/changes/messages, so this
 * always returns an array (often of length 1).
 */
export function parseInboundWebhook(payload: unknown): ParsedInboundMessage[] {
  const results: ParsedInboundMessage[] = [];

  if (!payload || typeof payload !== "object" || !("entry" in payload)) {
    return results;
  }

  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return results;

  for (const entry of entries) {
    const changes = isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const value = change.value;

      const phoneNumberId = isRecord(value.metadata) ? value.metadata.phone_number_id : undefined;
      if (typeof phoneNumberId !== "string") continue;

      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const contactName =
        isRecord(contacts[0]) && isRecord(contacts[0].profile) && typeof contacts[0].profile.name === "string"
          ? contacts[0].profile.name
          : undefined;

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        if (!isRecord(message) || message.type !== "text") continue;
        const from = message.from;
        const id = message.id;
        const timestamp = message.timestamp;
        const text = isRecord(message.text) ? message.text.body : undefined;

        if (
          typeof from === "string" &&
          typeof id === "string" &&
          typeof timestamp === "string" &&
          typeof text === "string"
        ) {
          results.push({ phoneNumberId, fromPhoneNumber: from, contactName, waMessageId: id, text, timestamp });
        }
      }
    }
  }

  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
