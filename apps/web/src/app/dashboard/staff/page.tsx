import type { Metadata } from "next";
import { StaffManager } from "@/domains/business-core/components/staff-manager";

export const metadata: Metadata = { title: "Staff — AI-F" };

export default function StaffPage() {
  return <StaffManager />;
}
