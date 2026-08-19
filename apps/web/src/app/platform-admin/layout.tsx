import { redirect } from "next/navigation";
import { resolvePlatformAdminContext } from "@/domains/platform-admin/guard";
import { signOut } from "@/domains/auth/actions";
import { Button } from "@/components/ui/button";

// Bounces both an unauthenticated visitor AND an authenticated-but-not-
// platform-admin one to /login — a legitimate tenant user hitting this by
// mistake just sees the login form again rather than a distinct "access
// denied" page. A known, accepted UX rough edge, not a security gap:
// resolvePlatformAdminContext() is the actual gate either way.
export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const context = await resolvePlatformAdminContext();

  if (!context) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Platform Admin</span>
          <span className="text-sm text-muted-foreground">{context.email}</span>
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
