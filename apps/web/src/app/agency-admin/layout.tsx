import { redirect } from "next/navigation";
import { resolveAgencyAdminContext } from "@/domains/agency-admin/guard";
import { signOut } from "@/domains/auth/actions";
import { Button } from "@/components/ui/button";

// Same bounce-to-/login behavior (and the same reasoning) as
// /platform-admin's layout — see its own comment.
export default async function AgencyAdminLayout({ children }: { children: React.ReactNode }) {
  const context = await resolveAgencyAdminContext();

  if (!context) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Agency Admin</span>
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
