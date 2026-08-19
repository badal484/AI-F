import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveTenantContext } from "@/domains/auth/session";

export const metadata: Metadata = { title: "Dashboard — AI-F" };

export default async function DashboardPage() {
  const context = await resolveTenantContext();

  if (!context) {
    redirect("/login");
  }

  if (context.isSuspended) {
    return (
      <Card className="max-w-md border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Workspace suspended</CardTitle>
          <CardDescription>
            This workspace has been suspended and no longer has dashboard access. Contact support to reactivate it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{context.tenantName}</h1>
        <p className="text-sm text-muted-foreground">/{context.tenantSlug}</p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Foundation verified</CardTitle>
          <CardDescription>
            Auth, database, and tenant isolation are wired end-to-end.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Signed in as</span>
            <span>{context.userEmail}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary">{context.role}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tenant ID</span>
            <span className="font-mono text-xs">{context.tenantId}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
