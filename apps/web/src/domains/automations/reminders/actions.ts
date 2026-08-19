"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type Reminder } from "@aif/db";
import { completeReminderSchema, type CompleteReminderInput, type DataActionResult } from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";

export type ReminderWithRelations = Reminder & {
  relatedLead: { id: string; name: string } | null;
  relatedCustomer: { id: string; name: string } | null;
};

// Reminders are day-to-day work (same tier as Inbox/Leads/Customers) — any
// role can see and complete them, not just OWNER/ADMIN.
export async function listReminders(): Promise<DataActionResult<ReminderWithRelations[]>> {
  try {
    const context = await requireTenantContext();
    const reminders = await getTenantDb(context.tenantId).reminder.findMany({
      where: { isCompleted: false },
      include: {
        relatedLead: { select: { id: true, name: true } },
        relatedCustomer: { select: { id: true, name: true } },
      },
      orderBy: { dueAt: "asc" },
    });
    return { data: reminders };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function completeReminder(input: CompleteReminderInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireTenantContext();
    const parsed = completeReminderSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).reminder.update({
      where: { id: parsed.data.id },
      data: { isCompleted: parsed.data.isCompleted },
    });

    revalidatePath("/dashboard/reminders");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
