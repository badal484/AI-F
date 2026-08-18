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
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;
