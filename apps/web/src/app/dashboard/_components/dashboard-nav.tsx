"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/appointments", label: "Appointments" },
  { href: "/dashboard/automations", label: "Automations" },
  { href: "/dashboard/reminders", label: "Reminders" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/locations", label: "Locations" },
  { href: "/dashboard/services", label: "Services" },
  { href: "/dashboard/staff", label: "Staff" },
  { href: "/dashboard/tags", label: "Tags" },
  { href: "/dashboard/knowledge", label: "Knowledge" },
  { href: "/dashboard/whatsapp-templates", label: "WhatsApp Templates" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const isActive = link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
