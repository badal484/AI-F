import { tool } from "ai";
import { z } from "zod";
import { searchKnowledgeBase } from "../rag/search";

/**
 * Semantic search over this tenant's knowledge base (Phase 6 — FAQs,
 * policies, and other documents staff have added). Complements
 * getBusinessInfo, which only covers structured facts (services,
 * locations, hours) — use this for anything else the business has
 * documented.
 */
export function createSearchKnowledgeBaseTool(tenantId: string) {
  return tool({
    description:
      "Search this business's knowledge base (FAQs, policies, and other documents staff have added) for information relevant to the customer's question. Use this for anything not covered by getBusinessInfo's structured services/locations/hours data.",
    inputSchema: z.object({
      query: z.string().min(1).describe("What to search for, phrased as the customer's question or topic"),
    }),
    execute: async (input) => {
      const results = await searchKnowledgeBase(tenantId, input.query, 3);
      if (results.length === 0) {
        return { found: false, results: [] };
      }
      return {
        found: true,
        results: results.map((r) => ({ content: r.content, relevance: 1 - r.distance })),
      };
    },
  });
}
