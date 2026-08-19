import twilio from "twilio";

/**
 * Built with the official `twilio` package's `twiml.VoiceResponse`
 * builder, not hand-rolled XML string templates — this isn't just
 * convenience, it's correctness: `sayText` ultimately comes from an AI
 * reply and, indirectly, from what a caller said, and the builder
 * properly escapes it for XML. Concatenating untrusted text into a raw
 * `<Say>...</Say>` string would be a real TwiML-injection risk (a
 * customer message containing `</Say><Redirect>...` could otherwise
 * hijack the call flow).
 */

/**
 * A "say this, then listen for a spoken reply" turn — the core loop of a
 * voice conversation. `actionOnEmptyResult: true` means Twilio always
 * POSTs back to `actionUrl` even if it heard nothing, rather than falling
 * through to different inline TwiML — keeping exactly one code path
 * (the route handler behind actionUrl) responsible for "what happens when
 * the caller says nothing," instead of splitting that logic between here
 * and there.
 */
export function buildGatherResponse(params: { sayText: string; actionUrl: string }): string {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: ["speech"],
    action: params.actionUrl,
    method: "POST",
    speechTimeout: "auto",
    actionOnEmptyResult: true,
  });
  gather.say(params.sayText);
  return response.toString();
}

/** Says a final line, then ends the call. */
export function buildHangupResponse(params: { sayText: string }): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say(params.sayText);
  response.hangup();
  return response.toString();
}
