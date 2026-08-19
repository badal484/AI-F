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

  // White-label branding (Phase 18) — only applied here, the
  // authenticated dashboard, never the public login/signup pages; see
  // Agency's own doc comment in schema.prisma for why. The tenant's own
  // name stays the primary header text either way — it's what actually
  // identifies "whose workspace this is" to the person using it; the
  // agency's logo/accent color is shown alongside it, not in place of it.
  // A tenant with no Agency, or an Agency with no branding configured,
  // sees the default header exactly as before.
  const branding = context.agencyBranding;

  return (
    <div className="flex flex-1 flex-col">
      <header
        className="flex items-center justify-between border-b px-6 py-3"
        style={branding?.primaryColor ? { borderBottomColor: branding.primaryColor } : undefined}
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            {branding?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- an arbitrary agency-supplied URL, not a local/optimizable asset
              <img src={branding.logoUrl} alt={branding.name} className="h-6 w-6 rounded object-contain" />
            )}
            <span className="font-semibold">{context.tenantName}</span>
          </div>
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
