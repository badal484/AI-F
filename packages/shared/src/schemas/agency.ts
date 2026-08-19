import { z } from "zod";
import { slugSchema } from "./tenant";

const id = z.string().min(1);

export const createAgencySchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  logoUrl: z.string().url().max(500).optional().or(z.literal("")),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be a hex color like #6366f1")
    .optional()
    .or(z.literal("")),
  supportEmail: z.string().email().max(255).optional().or(z.literal("")),
});
export type CreateAgencyInput = z.infer<typeof createAgencySchema>;

// agencyId "" means "remove this tenant from its agency" — a raw
// nullable-via-empty-string field, same convention nullifyEmptyStrings()
// already relies on elsewhere in this codebase.
export const setTenantAgencySchema = z.object({
  tenantId: id,
  agencyId: z.string().min(1).optional().or(z.literal("")),
});
export type SetTenantAgencyInput = z.infer<typeof setTenantAgencySchema>;
