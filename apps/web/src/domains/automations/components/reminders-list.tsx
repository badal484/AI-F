"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { completeReminder, listReminders, type ReminderWithRelations } from "@/domains/automations/reminders/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const REMINDERS_KEY = ["reminders"] as const;

function formatDueAt(dueAt: Date | string): string {
  return new Date(dueAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function RemindersList() {
  const queryClient = useQueryClient();

  const { data: reminders, isLoading } = useQuery({
    queryKey: REMINDERS_KEY,
    queryFn: async () => {
      const result = await listReminders();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const completeMutation = useMutation({
    mutationFn: completeReminder,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<ReminderWithRelations[]>(REMINDERS_KEY, (prev) =>
        (prev ?? []).filter((r) => r.id !== variables.id),
      );
      toast.success("Reminder completed");
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Reminders</h1>
        <p className="text-sm text-muted-foreground">Open reminders created by your automations.</p>
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}

      {reminders && reminders.length === 0 && (
        <p className="text-sm text-muted-foreground">No open reminders right now.</p>
      )}

      {reminders && reminders.length > 0 && (
        <ul className="flex flex-col gap-2">
          {reminders.map((reminder) => (
            <li
              key={reminder.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="font-medium">{reminder.title}</p>
                <p className="text-sm text-muted-foreground">
                  Due {formatDueAt(reminder.dueAt)}
                  {reminder.relatedLead && ` · Lead: ${reminder.relatedLead.name}`}
                  {reminder.relatedCustomer && ` · Customer: ${reminder.relatedCustomer.name}`}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={completeMutation.isPending}
                onClick={() => completeMutation.mutate({ id: reminder.id, isCompleted: true })}
              >
                Mark done
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
