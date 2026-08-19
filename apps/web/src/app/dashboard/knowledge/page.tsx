import type { Metadata } from "next";
import { KnowledgeManager } from "@/domains/knowledge/components/knowledge-manager";

export const metadata: Metadata = { title: "Knowledge base — AI-F" };

export default function KnowledgePage() {
  return <KnowledgeManager />;
}
