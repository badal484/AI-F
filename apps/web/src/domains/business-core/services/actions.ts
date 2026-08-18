"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Service } from "@aif/db";
import {
  createServiceSchema,
  updateServiceSchema,
  deleteByIdSchema,
  nullifyEmptyStrings,
  type CreateServiceInput,
  type UpdateServiceInput,
  type DeleteByIdInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, requireWriteAccess, UnauthorizedError } from "@/domains/auth/guard";

export async function listServices(): Promise<DataActionResult<Service[]>> {
  try {
    const context = await requireTenantContext();
    const services = await getTenantDb(context.tenantId).service.findMany({
      orderBy: { createdAt: "asc" },
    });
    return { data: services };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createService(input: CreateServiceInput): Promise<DataActionResult<Service>> {
  try {
    const context = await requireWriteAccess();
    const parsed = createServiceSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const service = await getTenantDb(context.tenantId).service.create({
      data: { ...nullifyEmptyStrings(parsed.data), tenantId: context.tenantId },
    });

    revalidatePath("/dashboard/services");
    return { data: service };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateService(input: UpdateServiceInput): Promise<DataActionResult<Service>> {
  try {
    const context = await requireWriteAccess();
    const parsed = updateServiceSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { id, ...data } = parsed.data;

    const service = await getTenantDb(context.tenantId).service.update({
      where: { id },
      data: nullifyEmptyStrings(data),
    });

    revalidatePath("/dashboard/services");
    return { data: service };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function deleteService(input: DeleteByIdInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireWriteAccess();
    const parsed = deleteByIdSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).service.delete({ where: { id: parsed.data.id } });

    revalidatePath("/dashboard/services");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
