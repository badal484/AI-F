"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Lead, type Tag, type TenantDb } from "@aif/db";
import { scheduleAutomationRuns } from "@aif/automations";
import {
  createLeadSchema,
  updateLeadSchema,
  updateLeadStageSchema,
  deleteByIdSchema,
  nullifyEmptyStrings,
  type CreateLeadInput,
  type UpdateLeadInput,
  type UpdateLeadStageInput,
  type DeleteByIdInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";
import { assertTagsBelongToTenant } from "@/domains/crm/shared";

export type LeadWithTags = Lead & { tags: Tag[] };

async function assertBelongsToTenant(
  tenantDb: TenantDb,
  model: "customer" | "user",
  id: string | null | undefined,
) {
  if (!id) return true;
  const record = await (model === "customer"
    ? tenantDb.customer.findUnique({ where: { id } })
    : tenantDb.user.findUnique({ where: { id } }));
  return Boolean(record);
}

export async function listLeads(): Promise<DataActionResult<LeadWithTags[]>> {
  try {
    const context = await requireTenantContext();
    const leads = await getTenantDb(context.tenantId).lead.findMany({
      include: { tags: true },
      orderBy: { createdAt: "asc" },
    });
    return { data: leads };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createLead(input: CreateLeadInput): Promise<DataActionResult<LeadWithTags>> {
  try {
    const context = await requireTenantContext();
    const parsed = createLeadSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { tagIds, ...rest } = nullifyEmptyStrings(parsed.data);
    const tenantDb = getTenantDb(context.tenantId);

    if (!(await assertTagsBelongToTenant(tenantDb, tagIds))) {
      return { error: "One or more tags not found" };
    }
    if (!(await assertBelongsToTenant(tenantDb, "customer", rest.customerId))) {
      return { error: "Customer not found" };
    }
    if (!(await assertBelongsToTenant(tenantDb, "user", rest.assignedToId))) {
      return { error: "Assignee not found" };
    }

    const lead = await tenantDb.lead.create({
      data: { ...rest, tenantId: context.tenantId, tags: { connect: tagIds.map((id) => ({ id })) } },
      include: { tags: true },
    });
    await scheduleAutomationRuns({ trigger: "LEAD_CREATED", tenantId: context.tenantId, entityId: lead.id });

    revalidatePath("/dashboard/leads");
    return { data: lead };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateLead(input: UpdateLeadInput): Promise<DataActionResult<LeadWithTags>> {
  try {
    const context = await requireTenantContext();
    const parsed = updateLeadSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { id, tagIds, ...rest } = nullifyEmptyStrings(parsed.data);
    const tenantDb = getTenantDb(context.tenantId);

    if (!(await assertTagsBelongToTenant(tenantDb, tagIds))) {
      return { error: "One or more tags not found" };
    }
    if (!(await assertBelongsToTenant(tenantDb, "customer", rest.customerId))) {
      return { error: "Customer not found" };
    }
    if (!(await assertBelongsToTenant(tenantDb, "user", rest.assignedToId))) {
      return { error: "Assignee not found" };
    }

    const lead = await tenantDb.lead.update({
      where: { id },
      data: { ...rest, tags: { set: tagIds.map((tagId) => ({ id: tagId })) } },
      include: { tags: true },
    });

    revalidatePath("/dashboard/leads");
    return { data: lead };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateLeadStage(input: UpdateLeadStageInput): Promise<DataActionResult<LeadWithTags>> {
  try {
    const context = await requireTenantContext();
    const parsed = updateLeadStageSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const lead = await getTenantDb(context.tenantId).lead.update({
      where: { id: parsed.data.id },
      data: { stage: parsed.data.stage },
      include: { tags: true },
    });
    await scheduleAutomationRuns({
      trigger: "LEAD_STAGE_CHANGED",
      tenantId: context.tenantId,
      entityId: lead.id,
      toStage: lead.stage,
    });

    revalidatePath("/dashboard/leads");
    return { data: lead };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function deleteLead(input: DeleteByIdInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireTenantContext();
    const parsed = deleteByIdSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).lead.delete({ where: { id: parsed.data.id } });

    revalidatePath("/dashboard/leads");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
