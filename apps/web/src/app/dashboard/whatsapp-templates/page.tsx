import type { Metadata } from "next";
import { TemplatesManager } from "@/domains/whatsapp/components/templates-manager";

export const metadata: Metadata = { title: "WhatsApp Templates — AI-F" };

export default function WhatsAppTemplatesPage() {
  return <TemplatesManager />;
}
