import { redirect } from "next/navigation";
import { resolveTenantContext } from "@/domains/auth/session";
import { signOut } from "@/domains/auth/actions";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "./_components/dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await resolveTenantContext();

  if (!context) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">{context.tenantName}</span>
          <DashboardNav />
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </header>
      <main className="flex flex-1 flex-col p-6">{children}</main>
    </div>
  );
}
