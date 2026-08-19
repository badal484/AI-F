"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type AutomationRule } from "@aif/db";
import {
  createAutomationRuleSchema,
  updateAutomationRuleSchema,
  toggleAutomationRuleSchema,
  deleteByIdSchema,
  nullifyEmptyStrings,
  type CreateAutomationRuleInput,
  type UpdateAutomationRuleInput,
  type ToggleAutomationRuleInput,
  type DeleteByIdInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, requireWriteAccess, UnauthorizedError } from "@/domains/auth/guard";

// whatsappTemplateId is a raw foreign id accepted from client input — must
// be verified against THIS tenant's own client before writing it, per
// packages/db/src/tenant.ts's documented limitation (getTenantDb() only
// scopes the top-level operation, not ids embedded in the payload).
async function assertTemplateBelongsToTenant(tenantId: string, templateId: string | null | undefined) {
  if (!templateId) return true;
  const template = await getTenantDb(tenantId).whatsAppTemplate.findUnique({ where: { id: templateId } });
  return Boolean(template);
}

export async function listAutomationRules(): Promise<DataActionResult<AutomationRule[]>> {
  try {
    const context = await requireTenantContext();
    const rules = await getTenantDb(context.tenantId).automationRule.findMany({
      orderBy: { createdAt: "asc" },
    });
    return { data: rules };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

// Configuring automations is a business-configuration action (same tier as
// WhatsApp templates/Services/Locations), not day-to-day work.
export async function createAutomationRule(
  input: CreateAutomationRuleInput,
): Promise<DataActionResult<AutomationRule>> {
  try {
    const context = await requireWriteAccess();
    const parsed = createAutomationRuleSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const data = nullifyEmptyStrings(parsed.data);

    if (!(await assertTemplateBelongsToTenant(context.tenantId, data.whatsappTemplateId))) {
      return { error: "Template not found" };
    }

    // Built explicitly (not spread) — Prisma's checked/unchecked create
    // input is a XOR union, and TS can't reliably match a spread object
    // with several optional properties against either branch.
    const rule = await getTenantDb(context.tenantId).automationRule.create({
      data: {
        tenantId: context.tenantId,
        name: data.name,
        trigger: data.trigger,
        triggerStage: data.triggerStage ?? null,
        delayMinutes: data.delayMinutes,
        actionType: data.actionType,
        whatsappTemplateId: data.whatsappTemplateId ?? null,
        reminderTitle: data.reminderTitle ?? null,
        isEnabled: data.isEnabled,
      },
    });

    revalidatePath("/dashboard/automations");
    return { data: rule };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateAutomationRule(
  input: UpdateAutomationRuleInput,
): Promise<DataActionResult<AutomationRule>> {
  try {
    const context = await requireWriteAccess();
    const parsed = updateAutomationRuleSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const data = nullifyEmptyStrings(parsed.data);

    if (!(await assertTemplateBelongsToTenant(context.tenantId, data.whatsappTemplateId))) {
      return { error: "Template not found" };
    }

    const rule = await getTenantDb(context.tenantId).automationRule.update({
      where: { id: data.id },
      data: {
        name: data.name,
        trigger: data.trigger,
        triggerStage: data.triggerStage ?? null,
        delayMinutes: data.delayMinutes,
        actionType: data.actionType,
        whatsappTemplateId: data.whatsappTemplateId ?? null,
        reminderTitle: data.reminderTitle ?? null,
        isEnabled: data.isEnabled,
      },
    });

    revalidatePath("/dashboard/automations");
    return { data: rule };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function toggleAutomationRule(
  input: ToggleAutomationRuleInput,
): Promise<DataActionResult<AutomationRule>> {
  try {
    const context = await requireWriteAccess();
    const parsed = toggleAutomationRuleSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const rule = await getTenantDb(context.tenantId).automationRule.update({
      where: { id: parsed.data.id },
      data: { isEnabled: parsed.data.isEnabled },
    });

    revalidatePath("/dashboard/automations");
    return { data: rule };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function deleteAutomationRule(input: DeleteByIdInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireWriteAccess();
    const parsed = deleteByIdSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).automationRule.delete({ where: { id: parsed.data.id } });

    revalidatePath("/dashboard/automations");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
