"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { DateTime } from "luxon";
import type { AvailabilitySlot } from "@aif/booking";
import { checkAvailability, createAppointment } from "@/domains/booking/appointments/actions";
import type { AppointmentWithRelations } from "@/domains/booking/appointments/actions";
import { listServices } from "@/domains/business-core/services/actions";
import { listLocations } from "@/domains/business-core/locations/actions";
import { listStaffMembers } from "@/domains/business-core/staff/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const NONE = "__none__";

const findSlotsSchema = z.object({
  serviceId: z.string().min(1, "Choose a service"),
  locationId: z.string().min(1, "Choose a location"),
  staffMemberId: z.string().optional(),
  date: z.string().min(1, "Choose a date"),
});
type FindSlotsValues = z.infer<typeof findSlotsSchema>;

const customerDetailsSchema = z.object({
  customerName: z.string().min(1, "Required"),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});
type CustomerDetailsValues = z.infer<typeof customerDetailsSchema>;

export function NewAppointmentDialog({ onCreated }: { onCreated: (appt: AppointmentWithRelations) => void }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [timezone, setTimezone] = useState<string>("UTC");
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [findValues, setFindValues] = useState<FindSlotsValues | null>(null);

  const { data: services } = useQuery({
    queryKey: ["services-for-booking"],
    queryFn: async () => {
      const result = await listServices();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
  const { data: locations } = useQuery({
    queryKey: ["locations-for-booking"],
    queryFn: async () => {
      const result = await listLocations();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
  const { data: staff } = useQuery({
    queryKey: ["staff-for-booking"],
    queryFn: async () => {
      const result = await listStaffMembers();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const findForm = useForm<FindSlotsValues>({
    resolver: zodResolver(findSlotsSchema),
    defaultValues: { serviceId: "", locationId: "", staffMemberId: "", date: "" },
  });

  const availabilityMutation = useMutation({
    mutationFn: checkAvailability,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setSlots(result.data.slots);
      setTimezone(result.data.timezone);
      setFindValues(variables);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const customerForm = useForm<CustomerDetailsValues>({
    resolver: zodResolver(customerDetailsSchema),
    defaultValues: { customerName: "", customerEmail: "", customerPhone: "", notes: "" },
  });

  const bookMutation = useMutation({
    mutationFn: createAppointment,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onCreated(result.data);
      toast.success("Appointment booked");
      reset();
      setOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  function reset() {
    setSlots(null);
    setSelectedSlot(null);
    setFindValues(null);
    findForm.reset();
    customerForm.reset();
  }

  function confirmBooking(values: CustomerDetailsValues) {
    if (!findValues || !selectedSlot) return;
    bookMutation.mutate({
      serviceId: findValues.serviceId,
      locationId: findValues.locationId,
      staffMemberId: findValues.staffMemberId,
      startAt: selectedSlot.startAt,
      ...values,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>New appointment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{selectedSlot ? "Confirm appointment" : "Find a time"}</DialogTitle>
        </DialogHeader>

        {!selectedSlot && (
          <form
            onSubmit={findForm.handleSubmit((values) => availabilityMutation.mutate(values))}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label>Service</Label>
              <Controller
                control={findForm.control}
                name="serviceId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {services?.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} ({service.durationMinutes} min)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {findForm.formState.errors.serviceId && (
                <p className="text-sm text-destructive">{findForm.formState.errors.serviceId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Controller
                control={findForm.control}
                name="locationId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations?.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {findForm.formState.errors.locationId && (
                <p className="text-sm text-destructive">{findForm.formState.errors.locationId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Staff member (optional)</Label>
              <Controller
                control={findForm.control}
                name="staffMemberId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Any</SelectItem>
                      {staff?.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-date">Date</Label>
              <Input id="appt-date" type="date" {...findForm.register("date")} />
              {findForm.formState.errors.date && (
                <p className="text-sm text-destructive">{findForm.formState.errors.date.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={availabilityMutation.isPending}>
                {availabilityMutation.isPending ? "Checking…" : "Check availability"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {!selectedSlot && slots && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">Times shown in {timezone}.</p>
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No availability that day.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <Button
                    key={slot.startAt}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {DateTime.fromISO(slot.startAt, { zone: timezone }).toFormat("h:mm a")}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedSlot && findValues && (
          <form onSubmit={customerForm.handleSubmit(confirmBooking)} className="space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">
              {DateTime.fromISO(selectedSlot.startAt, { zone: timezone }).toFormat("cccc, LLLL d 'at' h:mm a")} (
              {timezone})
            </p>
            <div className="space-y-2">
              <Label htmlFor="cust-name">Customer name</Label>
              <Input id="cust-name" {...customerForm.register("customerName")} />
              {customerForm.formState.errors.customerName && (
                <p className="text-sm text-destructive">{customerForm.formState.errors.customerName.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cust-email">Email</Label>
                <Input id="cust-email" type="email" {...customerForm.register("customerEmail")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-phone">Phone</Label>
                <Input id="cust-phone" type="tel" {...customerForm.register("customerPhone")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-notes">Notes</Label>
              <Textarea id="appt-notes" rows={2} {...customerForm.register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSelectedSlot(null)}>
                Back
              </Button>
              <Button type="submit" disabled={bookMutation.isPending}>
                {bookMutation.isPending ? "Booking…" : "Confirm booking"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
