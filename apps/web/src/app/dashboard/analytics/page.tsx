import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/domains/analytics/components/analytics-dashboard";

export const metadata: Metadata = { title: "Analytics — AI-F" };

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
