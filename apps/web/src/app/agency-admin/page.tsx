import type { Metadata } from "next";
import { AgencyAdminDashboard } from "@/domains/agency-admin/components/agency-admin-dashboard";

export const metadata: Metadata = { title: "Agency Admin — AI-F" };

export default function AgencyAdminPage() {
  return <AgencyAdminDashboard />;
}
