"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Customer, type Tag } from "@aif/db";
import {
  createCustomerSchema,
  updateCustomerSchema,
  deleteByIdSchema,
  nullifyEmptyStrings,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type DeleteByIdInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, requireWriteAccess, UnauthorizedError } from "@/domains/auth/guard";
import { assertTagsBelongToTenant } from "@/domains/crm/shared";

export type CustomerWithTags = Customer & { tags: Tag[] };

export async function listCustomers(): Promise<DataActionResult<CustomerWithTags[]>> {
  try {
    const context = await requireTenantContext();
    const customers = await getTenantDb(context.tenantId).customer.findMany({
      include: { tags: true },
      orderBy: { createdAt: "asc" },
    });
    return { data: customers };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createCustomer(input: CreateCustomerInput): Promise<DataActionResult<CustomerWithTags>> {
  try {
    const context = await requireWriteAccess();
    const parsed = createCustomerSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { tagIds, ...rest } = nullifyEmptyStrings(parsed.data);
    const tenantDb = getTenantDb(context.tenantId);

    if (!(await assertTagsBelongToTenant(tenantDb, tagIds))) {
      return { error: "One or more tags not found" };
    }

    const customer = await tenantDb.customer.create({
      data: { ...rest, tenantId: context.tenantId, tags: { connect: tagIds.map((id) => ({ id })) } },
      include: { tags: true },
    });

    revalidatePath("/dashboard/customers");
    return { data: customer };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateCustomer(input: UpdateCustomerInput): Promise<DataActionResult<CustomerWithTags>> {
  try {
    const context = await requireWriteAccess();
    const parsed = updateCustomerSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { id, tagIds, ...rest } = nullifyEmptyStrings(parsed.data);
    const tenantDb = getTenantDb(context.tenantId);

    if (!(await assertTagsBelongToTenant(tenantDb, tagIds))) {
      return { error: "One or more tags not found" };
    }

    const customer = await tenantDb.customer.update({
      where: { id },
      data: { ...rest, tags: { set: tagIds.map((tagId) => ({ id: tagId })) } },
      include: { tags: true },
    });

    revalidatePath("/dashboard/customers");
    return { data: customer };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function deleteCustomer(input: DeleteByIdInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireWriteAccess();
    const parsed = deleteByIdSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).customer.delete({ where: { id: parsed.data.id } });

    revalidatePath("/dashboard/customers");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
