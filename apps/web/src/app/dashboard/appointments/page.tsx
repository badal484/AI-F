import type { Metadata } from "next";
import { AppointmentsManager } from "@/domains/booking/components/appointments-manager";

export const metadata: Metadata = { title: "Appointments — AI-F" };

export default function AppointmentsPage() {
  return <AppointmentsManager />;
}
