import { z } from "zod";

const id = z.string().min(1);

export const AUTOMATION_TRIGGERS = ["APPOINTMENT_CREATED", "LEAD_CREATED", "LEAD_STAGE_CHANGED"] as const;
export const AUTOMATION_ACTION_TYPES = ["SEND_WHATSAPP_TEMPLATE", "CREATE_REMINDER"] as const;
export const AUTOMATION_LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"] as const;

const automationRuleFields = {
  name: z.string().min(1).max(150),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  // No .or(z.literal("")) here (unlike the string fields below) — this is
  // a real enum on the Prisma side (LeadStage?), and "" is not a member of
  // it, so the UI must send undefined rather than "" when not applicable.
  triggerStage: z.enum(AUTOMATION_LEAD_STAGES).optional(),
  // Minutes, capped at 30 days — anything longer belongs in a real
  // scheduling tool, not a reminder rule.
  delayMinutes: z.coerce.number().int().min(0).max(43_200).default(0),
  actionType: z.enum(AUTOMATION_ACTION_TYPES),
  whatsappTemplateId: z.string().min(1).optional().or(z.literal("")),
  reminderTitle: z.string().max(200).optional().or(z.literal("")),
  isEnabled: z.boolean().default(true),
};

function requireTriggerStageForStageChange<T extends { trigger: string; triggerStage?: string }>(
  v: T,
  ctx: z.RefinementCtx,
) {
  if (v.trigger === "LEAD_STAGE_CHANGED" && !v.triggerStage) {
    ctx.addIssue({ code: "custom", message: "Select a stage for a Lead stage changed trigger", path: ["triggerStage"] });
  }
}

function requireActionConfig<T extends { actionType: string; whatsappTemplateId?: string; reminderTitle?: string }>(
  v: T,
  ctx: z.RefinementCtx,
) {
  if (v.actionType === "SEND_WHATSAPP_TEMPLATE" && !v.whatsappTemplateId) {
    ctx.addIssue({ code: "custom", message: "Select a WhatsApp template", path: ["whatsappTemplateId"] });
  }
  if (v.actionType === "CREATE_REMINDER" && !v.reminderTitle) {
    ctx.addIssue({ code: "custom", message: "Enter a reminder title", path: ["reminderTitle"] });
  }
}

export const createAutomationRuleSchema = z
  .object(automationRuleFields)
  .superRefine(requireTriggerStageForStageChange)
  .superRefine(requireActionConfig);
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;

export const updateAutomationRuleSchema = z
  .object({ id, ...automationRuleFields })
  .superRefine(requireTriggerStageForStageChange)
  .superRefine(requireActionConfig);
export type UpdateAutomationRuleInput = z.infer<typeof updateAutomationRuleSchema>;

export const toggleAutomationRuleSchema = z.object({ id, isEnabled: z.boolean() });
export type ToggleAutomationRuleInput = z.infer<typeof toggleAutomationRuleSchema>;

export const completeReminderSchema = z.object({ id, isCompleted: z.boolean() });
export type CompleteReminderInput = z.infer<typeof completeReminderSchema>;
