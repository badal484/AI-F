import type { Metadata } from "next";
import { PlatformAdminDashboard } from "@/domains/platform-admin/components/platform-admin-dashboard";

export const metadata: Metadata = { title: "Platform Admin — AI-F" };

export default function PlatformAdminPage() {
  return <PlatformAdminDashboard />;
}
