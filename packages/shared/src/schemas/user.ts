import { z } from "zod";
import { ROLES } from "../types";

export const roleSchema = z.enum(ROLES);

export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "password must be at least 8 characters"),
  tenantName: z.string().min(1).max(120),
  tenantSlug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase alphanumeric with single hyphens"),
  // Set via a reseller's own invite link (?agency=<id>), never typed in —
  // see signUp()'s own doc comment (Phase 18). Looked up and validated
  // server-side regardless; an unrecognized id is ignored rather than
  // blocking signup, not trusted as-is.
  agencyId: z.string().min(1).optional().or(z.literal("")),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;
