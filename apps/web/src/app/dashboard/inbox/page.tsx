import type { Metadata } from "next";
import { InboxView } from "@/domains/inbox/components/inbox-view";

export const metadata: Metadata = { title: "Inbox — AI-F" };

export default function InboxPage() {
  return <InboxView />;
}
