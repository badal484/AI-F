"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Tag } from "@aif/db";
import {
  createTagSchema,
  deleteByIdSchema,
  type CreateTagInput,
  type DeleteByIdInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, requireWriteAccess, UnauthorizedError } from "@/domains/auth/guard";

export async function listTags(): Promise<DataActionResult<Tag[]>> {
  try {
    const context = await requireTenantContext();
    const tags = await getTenantDb(context.tenantId).tag.findMany({ orderBy: { name: "asc" } });
    return { data: tags };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createTag(input: CreateTagInput): Promise<DataActionResult<Tag>> {
  try {
    const context = await requireWriteAccess();
    const parsed = createTagSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const existing = await getTenantDb(context.tenantId).tag.findUnique({
      where: { tenantId_name: { tenantId: context.tenantId, name: parsed.data.name } },
    });
    if (existing) {
      return { error: "A tag with that name already exists" };
    }

    const tag = await getTenantDb(context.tenantId).tag.create({
      data: { ...parsed.data, tenantId: context.tenantId },
    });

    revalidatePath("/dashboard/tags");
    return { data: tag };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function deleteTag(input: DeleteByIdInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireWriteAccess();
    const parsed = deleteByIdSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).tag.delete({ where: { id: parsed.data.id } });

    revalidatePath("/dashboard/tags");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
