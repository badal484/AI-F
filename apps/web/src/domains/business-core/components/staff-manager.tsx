"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createStaffMemberSchema, type CreateStaffMemberInput } from "@aif/shared";
import type { Location, StaffMember } from "@aif/db";
import {
  createStaffMember,
  deleteStaffMember,
  listStaffMembers,
  updateStaffMember,
} from "@/domains/business-core/staff/actions";
import { listLocations } from "@/domains/business-core/locations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const STAFF_KEY = ["staff"] as const;
const LOCATIONS_KEY = ["locations"] as const;
const NO_LOCATION = "__none__";

function StaffForm({
  defaultValues,
  locations,
  onSubmit,
  submitLabel,
}: {
  defaultValues?: Partial<CreateStaffMemberInput>;
  locations: Location[];
  onSubmit: (values: CreateStaffMemberInput) => void;
  submitLabel: string;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createStaffMemberSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      title: defaultValues?.title ?? "",
      locationId: defaultValues?.locationId ?? "",
      isBookable: defaultValues?.isBookable ?? true,
    },
  });

  function submit(values: Partial<CreateStaffMemberInput>) {
    onSubmit({ ...values, isBookable: values.isBookable ?? true } as CreateStaffMemberInput);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="staff-name">Name</Label>
        <Input id="staff-name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff-title">Title</Label>
        <Input id="staff-title" placeholder="Stylist, Dentist, Agent…" {...register("title")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="staff-email">Email</Label>
          <Input id="staff-email" type="email" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-phone">Phone</Label>
          <Input id="staff-phone" type="tel" {...register("phone")} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Location</Label>
        <Controller
          control={control}
          name="locationId"
          render={({ field }) => (
            <Select
              value={field.value || NO_LOCATION}
              onValueChange={(value) => field.onChange(value === NO_LOCATION ? "" : value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LOCATION}>No location</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="isBookable"
          render={({ field }) => (
            <Switch id="staff-bookable" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
        <Label htmlFor="staff-bookable">Bookable</Label>
      </div>
      <DialogFooter>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

export function StaffManager() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);

  const { data: staff, isLoading } = useQuery({
    queryKey: STAFF_KEY,
    queryFn: async () => {
      const result = await listStaffMembers();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const { data: locations } = useQuery({
    queryKey: LOCATIONS_KEY,
    queryFn: async () => {
      const result = await listLocations();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: createStaffMember,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<StaffMember[]>(STAFF_KEY, (prev) => [...(prev ?? []), result.data]);
      toast.success("Staff member added");
      setCreateOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const updateMutation = useMutation({
    mutationFn: updateStaffMember,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<StaffMember[]>(STAFF_KEY, (prev) =>
        (prev ?? []).map((s) => (s.id === result.data.id ? result.data : s)),
      );
      toast.success("Staff member updated");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStaffMember,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<StaffMember[]>(STAFF_KEY, (prev) =>
        (prev ?? []).filter((s) => s.id !== variables.id),
      );
      toast.success("Staff member removed");
    },
    onError: () => toast.error("Something went wrong"),
  });

  function locationName(locationId: string | null) {
    return locations?.find((l) => l.id === locationId)?.name ?? "—";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="text-sm text-muted-foreground">Bookable people at your business.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>Add staff member</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New staff member</DialogTitle>
            </DialogHeader>
            <StaffForm
              submitLabel="Add"
              locations={locations ?? []}
              onSubmit={(values) => createMutation.mutate(values)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {staff && staff.length === 0 && (
        <p className="text-sm text-muted-foreground">No staff yet. Add your first one above.</p>
      )}

      {staff && staff.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell>{member.title || "—"}</TableCell>
                <TableCell>{locationName(member.locationId)}</TableCell>
                <TableCell>
                  <Badge variant={member.isBookable ? "secondary" : "outline"}>
                    {member.isBookable ? "Bookable" : "Not bookable"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(member)}>
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      Delete
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: member.id })}>
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit staff member</DialogTitle>
          </DialogHeader>
          {editing && (
            <StaffForm
              submitLabel="Save"
              locations={locations ?? []}
              defaultValues={{
                name: editing.name,
                email: editing.email ?? "",
                phone: editing.phone ?? "",
                title: editing.title ?? "",
                locationId: editing.locationId ?? "",
                isBookable: editing.isBookable,
              }}
              onSubmit={(values) => updateMutation.mutate({ ...values, id: editing.id })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
