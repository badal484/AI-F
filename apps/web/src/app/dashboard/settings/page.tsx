import type { Metadata } from "next";
import { headers } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantProfile } from "@/domains/business-core/profile/actions";
import { SettingsForm } from "@/domains/business-core/components/settings-form";
import { EmbedSnippet } from "@/domains/widget/components/embed-snippet";

export const metadata: Metadata = { title: "Settings — AI-F" };

export default async function SettingsPage() {
  const result = await getTenantProfile();

  // Derived from the actual incoming request rather than a hardcoded env
  // var, so the snippet is correct in dev/staging/prod alike without
  // needing a NEXT_PUBLIC_APP_URL to stay in sync with wherever this is
  // actually deployed.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Your business profile.</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>Shown to customers and used by your AI assistant.</CardDescription>
        </CardHeader>
        <CardContent>
          {"error" in result ? (
            <p className="text-sm text-destructive">{result.error}</p>
          ) : (
            <SettingsForm tenant={result.data} />
          )}
        </CardContent>
      </Card>

      {!("error" in result) && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Website chat widget</CardTitle>
            <CardDescription>
              Paste this into your website&apos;s HTML to add the chat widget. Requires the widget to be enabled and
              your site&apos;s origin listed above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmbedSnippet
              snippet={`<script src="${origin}/widget.js" data-tenant-id="${result.data.id}" async></script>`}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
