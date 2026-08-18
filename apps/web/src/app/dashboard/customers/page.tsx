import type { Metadata } from "next";
import { CustomersManager } from "@/domains/crm/components/customers-manager";

export const metadata: Metadata = { title: "Customers — AI-F" };

export default function CustomersPage() {
  return <CustomersManager />;
}
