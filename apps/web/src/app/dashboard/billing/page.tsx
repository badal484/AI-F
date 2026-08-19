import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingDashboard } from "@/domains/billing/components/billing-dashboard";

export const metadata: Metadata = { title: "Billing — AI-F" };

export default function BillingPage() {
  return (
    <Suspense>
      <BillingDashboard />
    </Suspense>
  );
}
