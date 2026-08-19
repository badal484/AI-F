"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { DateTime } from "luxon";
import { APPOINTMENT_STATUSES } from "@aif/shared";
import type { AppointmentStatus } from "@aif/db";
import {
  listAppointments,
  updateAppointmentStatus,
  type AppointmentWithRelations,
} from "@/domains/booking/appointments/actions";
import { NewAppointmentDialog } from "@/domains/booking/components/new-appointment-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const APPOINTMENTS_KEY = ["appointments"] as const;

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

const STATUS_VARIANTS: Record<AppointmentStatus, "secondary" | "outline" | "destructive"> = {
  SCHEDULED: "outline",
  CONFIRMED: "secondary",
  CANCELLED: "destructive",
  COMPLETED: "secondary",
  NO_SHOW: "destructive",
};

export function AppointmentsManager() {
  const queryClient = useQueryClient();

  const { data: appointments, isLoading } = useQuery({
    queryKey: APPOINTMENTS_KEY,
    queryFn: async () => {
      const result = await listAppointments();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const statusMutation = useMutation({
    mutationFn: updateAppointmentStatus,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: APPOINTMENTS_KEY });
      const previous = queryClient.getQueryData<AppointmentWithRelations[]>(APPOINTMENTS_KEY);
      queryClient.setQueryData<AppointmentWithRelations[]>(APPOINTMENTS_KEY, (prev) =>
        (prev ?? []).map((a) => (a.id === variables.id ? { ...a, status: variables.status } : a)),
      );
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(APPOINTMENTS_KEY, context.previous);
      toast.error("Something went wrong");
    },
    onSuccess: (result) => {
      if ("error" in result) toast.error(result.error);
    },
  });

  function handleCreated(appt: AppointmentWithRelations) {
    queryClient.setQueryData<AppointmentWithRelations[]>(APPOINTMENTS_KEY, (prev) => [appt, ...(prev ?? [])]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Appointments</h1>
          <p className="text-sm text-muted-foreground">Booked slots across your services and locations.</p>
        </div>
        <NewAppointmentDialog onCreated={handleCreated} />
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {appointments && appointments.length === 0 && (
        <p className="text-sm text-muted-foreground">No appointments yet. Book your first one above.</p>
      )}

      {appointments && appointments.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.map((appt) => (
              <TableRow key={appt.id}>
                <TableCell className="font-medium">{appt.customerName}</TableCell>
                <TableCell>{appt.service.name}</TableCell>
                <TableCell>{appt.location.name}</TableCell>
                <TableCell>{appt.staffMember?.name ?? "—"}</TableCell>
                <TableCell>
                  {DateTime.fromJSDate(appt.startAt, { zone: appt.location.timezone }).toFormat(
                    "ccc, LLL d 'at' h:mm a",
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={appt.status}
                    onValueChange={(status) =>
                      statusMutation.mutate({ id: appt.id, status: status as AppointmentStatus })
                    }
                  >
                    <SelectTrigger size="sm" className="w-36">
                      <SelectValue>
                        <Badge variant={STATUS_VARIANTS[appt.status]}>{STATUS_LABELS[appt.status]}</Badge>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {APPOINTMENT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
