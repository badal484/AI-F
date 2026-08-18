import type { Metadata } from "next";
import { ServicesManager } from "@/domains/business-core/components/services-manager";

export const metadata: Metadata = { title: "Services — AI-F" };

export default function ServicesPage() {
  return <ServicesManager />;
}
