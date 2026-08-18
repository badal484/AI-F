import { z } from "zod";

const id = z.string().min(1);

export const LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"] as const;
export const LEAD_SOURCES = ["WEBSITE", "WHATSAPP", "MANUAL", "REFERRAL", "OTHER"] as const;

const customerFields = {
  name: z.string().min(1).max(150),
  email: z.string().email().max(255).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  tagIds: z.array(id).default([]),
};
export const createCustomerSchema = z.object(customerFields);
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export const updateCustomerSchema = createCustomerSchema.extend({ id });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

const leadFields = {
  name: z.string().min(1).max(150),
  email: z.string().email().max(255).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  source: z.enum(LEAD_SOURCES).default("OTHER"),
  stage: z.enum(LEAD_STAGES).default("NEW"),
  valueCents: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
  customerId: z.string().min(1).optional().or(z.literal("")),
  assignedToId: z.string().min(1).optional().or(z.literal("")),
  tagIds: z.array(id).default([]),
};
export const createLeadSchema = z.object(leadFields);
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export const updateLeadSchema = createLeadSchema.extend({ id });
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const updateLeadStageSchema = z.object({ id, stage: z.enum(LEAD_STAGES) });
export type UpdateLeadStageInput = z.infer<typeof updateLeadStageSchema>;

export const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be a hex color like #6b7280")
    .default("#6b7280"),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;
