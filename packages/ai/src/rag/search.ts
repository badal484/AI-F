import { searchChunks, type ChunkSearchResult } from "@aif/db";
import { embedText, isEmbeddingConfigured } from "./embed";

export type { ChunkSearchResult };

/**
 * Embeds `query` and finds the most similar knowledge-base chunks for this
 * tenant. Throws if embeddings are NOT CONFIGURED; callers must check
 * isEmbeddingConfigured() first and degrade gracefully.
 */
export async function searchKnowledgeBase(
  tenantId: string,
  query: string,
  limit = 5,
): Promise<ChunkSearchResult[]> {
  if (!isEmbeddingConfigured()) {
    throw new Error("Embeddings are NOT CONFIGURED — cannot search the knowledge base");
  }
  const queryEmbedding = await embedText(query);
  return searchChunks(tenantId, queryEmbedding, limit);
}
