import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantProfile } from "@/domains/business-core/profile/actions";
import { SettingsForm } from "@/domains/business-core/components/settings-form";

export const metadata: Metadata = { title: "Settings — AI-F" };

export default async function SettingsPage() {
  const result = await getTenantProfile();

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
    </div>
  );
}
