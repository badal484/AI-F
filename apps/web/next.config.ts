import type { NextConfig } from "next";

// No nonce-based CSP here — that requires forcing every page to dynamic
// rendering (Next.js's own docs: "all pages must be dynamically
// rendered"), a real architecture/performance tradeoff this repo hasn't
// had a chance to verify visually in a browser (no live Supabase/DB in
// this environment). This is Next's own documented "Without Nonces"
// baseline instead — 'unsafe-inline' is required because React's `style`
// prop renders as inline `style=""` attributes (used throughout this
// app's bar-chart-style UI, e.g. domains/analytics, domains/automations),
// and CSP has no nonce mechanism for style *attributes*, only `<style>`
// elements. Still real protection: blocks loading scripts/objects/frames
// from any external origin, restricts <base>/<form> targets. See
// docs/ARCHITECTURE.md's "Security Hardening" section for the full
// reasoning and what a stricter policy would require.
function cspHeader(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const connectSrc = ["'self'", supabaseUrl].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  transpilePackages: [
    "@aif/db",
    "@aif/shared",
    "@aif/ai",
    "@aif/booking",
    "@aif/queue",
    "@aif/whatsapp",
    "@aif/automations",
    "@aif/billing",
    "@aif/voice",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
