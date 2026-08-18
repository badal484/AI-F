import type { Metadata } from "next";
import { TagsManager } from "@/domains/crm/components/tags-manager";

export const metadata: Metadata = { title: "Tags — AI-F" };

export default function TagsPage() {
  return <TagsManager />;
}
