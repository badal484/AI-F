import type { Metadata } from "next";
import { LeadsManager } from "@/domains/crm/components/leads-manager";

export const metadata: Metadata = { title: "Leads — AI-F" };

export default function LeadsPage() {
  return <LeadsManager />;
}
