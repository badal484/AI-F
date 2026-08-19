import { z } from "zod";

export const setTenantSuspendedSchema = z.object({
  tenantId: z.string().min(1),
  isSuspended: z.boolean(),
});
export type SetTenantSuspendedInput = z.infer<typeof setTenantSuspendedSchema>;
