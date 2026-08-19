import type { Metadata } from "next";
import { RemindersList } from "@/domains/automations/components/reminders-list";

export const metadata: Metadata = { title: "Reminders — AI-F" };

export default function RemindersPage() {
  return <RemindersList />;
}
