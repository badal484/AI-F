"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import type { CreateServiceInput } from "@aif/shared";
import type { Service } from "@aif/db";
import {
  createService,
  deleteService,
  listServices,
  updateService,
} from "@/domains/business-core/services/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const SERVICES_KEY = ["services"] as const;

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

const serviceFormSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().max(2000).optional().or(z.literal("")),
  durationMinutes: z.number().int().min(5).max(480),
  priceDollars: z.string().min(1, "required"),
  isActive: z.boolean(),
});
type ServiceFormValues = z.infer<typeof serviceFormSchema>;

function ServiceForm({
  defaultValues,
  onSubmit,
  submitLabel,
}: {
  defaultValues?: Partial<CreateServiceInput> & { priceDollars?: string };
  onSubmit: (values: CreateServiceInput) => void;
  submitLabel: string;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      durationMinutes: defaultValues?.durationMinutes ?? 30,
      isActive: defaultValues?.isActive ?? true,
      priceDollars: defaultValues?.priceDollars ?? "0",
    },
  });

  function submit(values: ServiceFormValues) {
    const { priceDollars, ...rest } = values;
    onSubmit({
      ...rest,
      currency: "usd",
      priceCents: Math.round(parseFloat(priceDollars || "0") * 100),
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="svc-name">Name</Label>
        <Input id="svc-name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="svc-description">Description</Label>
        <Textarea id="svc-description" rows={2} {...register("description")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="svc-duration">Duration (minutes)</Label>
          <Input id="svc-duration" type="number" min={5} max={480} {...register("durationMinutes", { valueAsNumber: true })} />
          {errors.durationMinutes && <p className="text-sm text-destructive">{errors.durationMinutes.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="svc-price">Price (USD)</Label>
          <Input id="svc-price" type="number" min={0} step="0.01" {...register("priceDollars")} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch id="svc-active" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
        <Label htmlFor="svc-active">Active</Label>
      </div>
      <DialogFooter>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

export function ServicesManager() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);

  const { data: services, isLoading } = useQuery({
    queryKey: SERVICES_KEY,
    queryFn: async () => {
      const result = await listServices();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: createService,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<Service[]>(SERVICES_KEY, (prev) => [...(prev ?? []), result.data]);
      toast.success("Service created");
      setCreateOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const updateMutation = useMutation({
    mutationFn: updateService,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<Service[]>(SERVICES_KEY, (prev) =>
        (prev ?? []).map((s) => (s.id === result.data.id ? result.data : s)),
      );
      toast.success("Service updated");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteService,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<Service[]>(SERVICES_KEY, (prev) =>
        (prev ?? []).filter((s) => s.id !== variables.id),
      );
      toast.success("Service deleted");
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Services</h1>
          <p className="text-sm text-muted-foreground">What your business offers and can be booked for.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>Add service</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New service</DialogTitle>
            </DialogHeader>
            <ServiceForm submitLabel="Create" onSubmit={(values) => createMutation.mutate(values)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {services && services.length === 0 && (
        <p className="text-sm text-muted-foreground">No services yet. Add your first one above.</p>
      )}

      {services && services.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>{service.durationMinutes} min</TableCell>
                <TableCell>{formatPrice(service.priceCents)}</TableCell>
                <TableCell>
                  <Badge variant={service.isActive ? "secondary" : "outline"}>
                    {service.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(service)}>
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      Delete
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {service.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: service.id })}>
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
            <DialogTitle>Edit service</DialogTitle>
          </DialogHeader>
          {editing && (
            <ServiceForm
              submitLabel="Save"
              defaultValues={{
                name: editing.name,
                description: editing.description ?? "",
                durationMinutes: editing.durationMinutes,
                isActive: editing.isActive,
                priceDollars: (editing.priceCents / 100).toString(),
              }}
              onSubmit={(values) => updateMutation.mutate({ ...values, id: editing.id })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
