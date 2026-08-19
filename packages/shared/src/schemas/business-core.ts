import { z } from "zod";

const id = z.string().min(1);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be in HH:mm 24-hour format");

export const tenantProfileSchema = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64),
  phone: z.string().max(30).optional().or(z.literal("")),
  website: z.string().url().max(255).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  whatsappPhoneNumberId: z.string().max(50).optional().or(z.literal("")),
});
export type TenantProfileInput = z.infer<typeof tenantProfileSchema>;

const locationFields = {
  name: z.string().min(1).max(150),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional().or(z.literal("")),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional().or(z.literal("")),
  postalCode: z.string().max(20).optional().or(z.literal("")),
  country: z.string().min(2).max(56).default("US"),
  phone: z.string().max(30).optional().or(z.literal("")),
  timezone: z.string().min(1).max(64),
  isPrimary: z.boolean().default(false),
};
export const createLocationSchema = z.object(locationFields);
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export const updateLocationSchema = createLocationSchema.extend({ id });
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const dayHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: timeOfDay,
  closeTime: timeOfDay,
  isClosed: z.boolean(),
});
export const updateLocationHoursSchema = z.object({
  locationId: id,
  days: z.array(dayHoursSchema).length(7, "must specify all 7 days of the week"),
});
export type UpdateLocationHoursInput = z.infer<typeof updateLocationHoursSchema>;

const serviceFields = {
  name: z.string().min(1).max(150),
  description: z.string().max(2000).optional().or(z.literal("")),
  durationMinutes: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0),
  currency: z
    .string()
    .length(3)
    .transform((v) => v.toLowerCase())
    .default("usd"),
  isActive: z.boolean().default(true),
};
export const createServiceSchema = z.object(serviceFields);
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export const updateServiceSchema = createServiceSchema.extend({ id });
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

const staffMemberFields = {
  name: z.string().min(1).max(150),
  email: z.string().email().max(255).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  title: z.string().max(150).optional().or(z.literal("")),
  locationId: z.string().min(1).optional().or(z.literal("")),
  isBookable: z.boolean().default(true),
};
export const createStaffMemberSchema = z.object(staffMemberFields);
export type CreateStaffMemberInput = z.infer<typeof createStaffMemberSchema>;
export const updateStaffMemberSchema = createStaffMemberSchema.extend({ id });
export type UpdateStaffMemberInput = z.infer<typeof updateStaffMemberSchema>;

export const deleteByIdSchema = z.object({ id });
export type DeleteByIdInput = z.infer<typeof deleteByIdSchema>;
