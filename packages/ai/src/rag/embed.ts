import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

/** 1536 dimensions — must match DocumentChunk.embedding's vector(1536) column. */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Embeddings specifically require OPENAI_API_KEY — Anthropic has no public
 * embeddings API, so this is independent of whichever provider getModel()
 * (./provider.ts) resolves for chat.
 */
export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function embedText(text: string): Promise<number[]> {
  if (!isEmbeddingConfigured()) {
    throw new Error("Embeddings are NOT CONFIGURED — set OPENAI_API_KEY");
  }
  const { embedding } = await embed({ model: openai.embedding(EMBEDDING_MODEL), value: text });
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!isEmbeddingConfigured()) {
    throw new Error("Embeddings are NOT CONFIGURED — set OPENAI_API_KEY");
  }
  const { embeddings } = await embedMany({ model: openai.embedding(EMBEDDING_MODEL), values: texts });
  return embeddings;
}
