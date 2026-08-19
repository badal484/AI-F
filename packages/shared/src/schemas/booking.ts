import { z } from "zod";

export const checkAvailabilitySchema = z.object({
  serviceId: z.string().min(1),
  locationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  staffMemberId: z.string().min(1).optional().or(z.literal("")),
});
export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>;

export const createAppointmentSchema = z.object({
  serviceId: z.string().min(1),
  locationId: z.string().min(1),
  staffMemberId: z.string().min(1).optional().or(z.literal("")),
  customerId: z.string().min(1).optional().or(z.literal("")),
  customerName: z.string().min(1).max(150),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().max(30).optional().or(z.literal("")),
  startAt: z.string().min(1),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;

export const updateAppointmentStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(APPOINTMENT_STATUSES),
});
export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;
