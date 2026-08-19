export function isTwilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export function missingTwilioEnvVars(): string[] {
  return [
    !process.env.TWILIO_ACCOUNT_SID && "TWILIO_ACCOUNT_SID",
    !process.env.TWILIO_AUTH_TOKEN && "TWILIO_AUTH_TOKEN",
  ].filter((v): v is string => Boolean(v));
}
