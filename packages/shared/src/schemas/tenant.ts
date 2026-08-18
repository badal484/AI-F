import { z } from "zod";

export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase alphanumeric with single hyphens");

export const createTenantSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  agencyId: z.string().cuid().optional(),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
