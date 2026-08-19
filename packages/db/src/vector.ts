import { getBasePrisma } from "./client";

/**
 * DocumentChunk.embedding is `Unsupported("vector(1536)")` — completely
 * invisible to Prisma Client's normal query API, so getTenantDb()'s
 * isolation extension (which wraps model methods) can't scope it. These
 * two functions are the ONLY sanctioned way to read or write that column.
 * Isolation here comes from requiring `tenantId` as a parameter and
 * baking `tenant_id = ...` into the raw SQL directly, not from the
 * extension — every call site must pass the real tenantId from
 * resolveTenantContext(), the same as everywhere else in this codebase.
 */

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Sets (or replaces) the embedding for one chunk. Throws if the chunk
 * doesn't exist for this tenant, so a wrong/foreign id fails loudly
 * instead of silently affecting zero rows.
 */
export async function setChunkEmbedding(
  tenantId: string,
  chunkId: string,
  embedding: number[],
): Promise<void> {
  const affected = await getBasePrisma().$executeRaw`
    UPDATE document_chunks
    SET embedding = ${toVectorLiteral(embedding)}::vector
    WHERE id = ${chunkId} AND tenant_id = ${tenantId}
  `;
  if (affected === 0) {
    throw new Error("Chunk not found for this tenant");
  }
}

export interface ChunkSearchResult {
  id: string;
  documentId: string;
  content: string;
  distance: number;
}

/**
 * Tenant-scoped cosine-distance nearest-neighbor search (pgvector's `<=>`
 * operator — smaller distance is more similar). Only returns chunks that
 * have an embedding.
 */
export async function searchChunks(
  tenantId: string,
  queryEmbedding: number[],
  limit = 5,
): Promise<ChunkSearchResult[]> {
  const vectorLiteral = toVectorLiteral(queryEmbedding);
  return getBasePrisma().$queryRaw<ChunkSearchResult[]>`
    SELECT id, document_id AS "documentId", content, embedding <=> ${vectorLiteral}::vector AS distance
    FROM document_chunks
    WHERE tenant_id = ${tenantId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;
}
