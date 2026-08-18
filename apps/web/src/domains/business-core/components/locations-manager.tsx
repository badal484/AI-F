"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createLocationSchema, type CreateLocationInput } from "@aif/shared";
import type { Location } from "@aif/db";
import {
  createLocation,
  deleteLocation,
  listLocations,
  updateLocation,
} from "@/domains/business-core/locations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { LocationHoursEditor } from "@/domains/business-core/components/location-hours-editor";

const LOCATIONS_KEY = ["locations"] as const;

function LocationForm({
  defaultValues,
  onSubmit,
  submitLabel,
}: {
  defaultValues?: Partial<CreateLocationInput>;
  onSubmit: (values: CreateLocationInput) => void;
  submitLabel: string;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createLocationSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      addressLine1: defaultValues?.addressLine1 ?? "",
      addressLine2: defaultValues?.addressLine2 ?? "",
      city: defaultValues?.city ?? "",
      state: defaultValues?.state ?? "",
      postalCode: defaultValues?.postalCode ?? "",
      country: defaultValues?.country ?? "US",
      phone: defaultValues?.phone ?? "",
      timezone: defaultValues?.timezone ?? "UTC",
      isPrimary: defaultValues?.isPrimary ?? false,
    },
  });

  function submit(values: Partial<CreateLocationInput>) {
    onSubmit({
      ...values,
      country: values.country ?? "US",
      isPrimary: values.isPrimary ?? false,
    } as CreateLocationInput);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="loc-name">Name</Label>
        <Input id="loc-name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="loc-address1">Address</Label>
        <Input id="loc-address1" {...register("addressLine1")} />
        {errors.addressLine1 && <p className="text-sm text-destructive">{errors.addressLine1.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="loc-address2">Address line 2</Label>
        <Input id="loc-address2" {...register("addressLine2")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="loc-city">City</Label>
          <Input id="loc-city" {...register("city")} />
          {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="loc-state">State</Label>
          <Input id="loc-state" {...register("state")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="loc-postal">Postal code</Label>
          <Input id="loc-postal" {...register("postalCode")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="loc-country">Country</Label>
          <Input id="loc-country" {...register("country")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="loc-phone">Phone</Label>
          <Input id="loc-phone" type="tel" {...register("phone")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="loc-timezone">Timezone</Label>
          <Input id="loc-timezone" placeholder="America/New_York" {...register("timezone")} />
          {errors.timezone && <p className="text-sm text-destructive">{errors.timezone.message}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="isPrimary"
          render={({ field }) => (
            <Switch id="loc-primary" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
        <Label htmlFor="loc-primary">Primary location</Label>
      </div>
      <DialogFooter>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

export function LocationsManager() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [hoursFor, setHoursFor] = useState<Location | null>(null);

  const { data: locations, isLoading } = useQuery({
    queryKey: LOCATIONS_KEY,
    queryFn: async () => {
      const result = await listLocations();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: createLocation,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<Location[]>(LOCATIONS_KEY, (prev) => [...(prev ?? []), result.data]);
      toast.success("Location created");
      setCreateOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const updateMutation = useMutation({
    mutationFn: updateLocation,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<Location[]>(LOCATIONS_KEY, (prev) =>
        (prev ?? []).map((l) => (l.id === result.data.id ? result.data : l)),
      );
      toast.success("Location updated");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLocation,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<Location[]>(LOCATIONS_KEY, (prev) =>
        (prev ?? []).filter((l) => l.id !== variables.id),
      );
      toast.success("Location deleted");
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Locations</h1>
          <p className="text-sm text-muted-foreground">Where your business operates from.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>Add location</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New location</DialogTitle>
            </DialogHeader>
            <LocationForm submitLabel="Create" onSubmit={(values) => createMutation.mutate(values)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {locations && locations.length === 0 && (
        <p className="text-sm text-muted-foreground">No locations yet. Add your first one above.</p>
      )}

      {locations && locations.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((location) => (
              <TableRow key={location.id}>
                <TableCell className="font-medium">
                  {location.name}
                  {location.isPrimary && (
                    <Badge variant="secondary" className="ml-2">
                      Primary
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {location.addressLine1}, {location.city}
                </TableCell>
                <TableCell>{location.timezone}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setHoursFor(location)}>
                    Hours
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(location)}>
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      Delete
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {location.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: location.id })}>
                          Delete
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
            <DialogTitle>Edit location</DialogTitle>
          </DialogHeader>
          {editing && (
            <LocationForm
              submitLabel="Save"
              defaultValues={{
                name: editing.name,
                addressLine1: editing.addressLine1,
                addressLine2: editing.addressLine2 ?? "",
                city: editing.city,
                state: editing.state ?? "",
                postalCode: editing.postalCode ?? "",
                country: editing.country,
                phone: editing.phone ?? "",
                timezone: editing.timezone,
                isPrimary: editing.isPrimary,
              }}
              onSubmit={(values) => updateMutation.mutate({ ...values, id: editing.id })}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={hoursFor !== null} onOpenChange={(open) => !open && setHoursFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hours — {hoursFor?.name}</DialogTitle>
          </DialogHeader>
          {hoursFor && <LocationHoursEditor locationId={hoursFor.id} onSaved={() => setHoursFor(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
