"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type KnowledgeDocument } from "@aif/db";
import { ingestDocument, isEmbeddingConfigured, searchKnowledgeBase, type ChunkSearchResult } from "@aif/ai";
import {
  createDocumentSchema,
  searchKnowledgeSchema,
  deleteByIdSchema,
  type CreateDocumentInput,
  type SearchKnowledgeInput,
  type DeleteByIdInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";

export type DocumentWithChunkCount = KnowledgeDocument & { _count: { chunks: number } };

export async function listDocuments(): Promise<DataActionResult<DocumentWithChunkCount[]>> {
  try {
    const context = await requireTenantContext();
    const documents = await getTenantDb(context.tenantId).knowledgeDocument.findMany({
      include: { _count: { select: { chunks: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { data: documents };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createDocument(
  input: CreateDocumentInput,
): Promise<DataActionResult<DocumentWithChunkCount>> {
  try {
    const context = await requireTenantContext();
    const parsed = createDocumentSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const tenantDb = getTenantDb(context.tenantId);
    const document = await tenantDb.knowledgeDocument.create({
      data: { tenantId: context.tenantId, title: parsed.data.title, content: parsed.data.content },
    });

    // Synchronous for now — no background job queue is wired up yet
    // (that's Phase 8/9's worker infrastructure). Fine for the document
    // sizes this UI accepts; ingestDocument itself never throws — it
    // records FAILED with a reason instead, per MASTER_INSTRUCTIONS.md §7.
    await ingestDocument(context.tenantId, document.id, parsed.data.content);

    const withCount = await tenantDb.knowledgeDocument.findUniqueOrThrow({
      where: { id: document.id },
      include: { _count: { select: { chunks: true } } },
    });

    revalidatePath("/dashboard/knowledge");
    return { data: withCount };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function deleteDocument(input: DeleteByIdInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireTenantContext();
    const parsed = deleteByIdSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).knowledgeDocument.delete({ where: { id: parsed.data.id } });

    revalidatePath("/dashboard/knowledge");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function testKnowledgeSearch(
  input: SearchKnowledgeInput,
): Promise<DataActionResult<ChunkSearchResult[]>> {
  try {
    const context = await requireTenantContext();
    const parsed = searchKnowledgeSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    if (!isEmbeddingConfigured()) {
      return { error: "Embeddings are NOT CONFIGURED — set OPENAI_API_KEY" };
    }

    const results = await searchKnowledgeBase(context.tenantId, parsed.data.query);
    return { data: results };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
