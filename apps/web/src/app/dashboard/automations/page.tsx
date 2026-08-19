import type { Metadata } from "next";
import { AutomationRulesManager } from "@/domains/automations/components/automation-rules-manager";

export const metadata: Metadata = { title: "Automations — AI-F" };

export default function AutomationsPage() {
  return <AutomationRulesManager />;
}
