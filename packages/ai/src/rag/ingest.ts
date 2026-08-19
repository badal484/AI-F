import { getTenantDb, setChunkEmbedding } from "@aif/db";
import { chunkText } from "./chunk";
import { embedTexts, isEmbeddingConfigured } from "./embed";

/**
 * Chunks, embeds, and stores a KnowledgeDocument's content, updating its
 * status to READY or FAILED (with a reason) — never leaves it silently
 * stuck at PENDING, and never fakes success if embeddings are NOT
 * CONFIGURED (MASTER_INSTRUCTIONS.md §7).
 */
export async function ingestDocument(tenantId: string, documentId: string, content: string): Promise<void> {
  const db = getTenantDb(tenantId);

  if (!isEmbeddingConfigured()) {
    await db.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: "FAILED", error: "Embeddings are NOT CONFIGURED — set OPENAI_API_KEY" },
    });
    return;
  }

  try {
    const chunks = chunkText(content);
    if (chunks.length === 0) {
      await db.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: "FAILED", error: "Document has no content to embed" },
      });
      return;
    }

    const embeddings = await embedTexts(chunks);

    const createdChunks = await db.$transaction(
      chunks.map((chunkContent, index) =>
        db.documentChunk.create({
          data: { tenantId, documentId, chunkIndex: index, content: chunkContent },
        }),
      ),
    );

    for (const [index, chunk] of createdChunks.entries()) {
      const embedding = embeddings[index];
      if (!embedding) {
        throw new Error(`Missing embedding for chunk ${index}`);
      }
      await setChunkEmbedding(tenantId, chunk.id, embedding);
    }

    await db.knowledgeDocument.update({ where: { id: documentId }, data: { status: "READY", error: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error while embedding document";
    await db.knowledgeDocument.update({ where: { id: documentId }, data: { status: "FAILED", error: message } });
  }
}
