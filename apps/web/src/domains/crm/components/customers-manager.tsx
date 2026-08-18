"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createCustomerSchema, type CreateCustomerInput } from "@aif/shared";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
  type CustomerWithTags,
} from "@/domains/crm/customers/actions";
import { TagPicker } from "@/domains/crm/components/tag-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const CUSTOMERS_KEY = ["customers"] as const;

function CustomerForm({
  defaultValues,
  onSubmit,
  submitLabel,
}: {
  defaultValues?: Partial<CreateCustomerInput>;
  onSubmit: (values: CreateCustomerInput) => void;
  submitLabel: string;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      notes: defaultValues?.notes ?? "",
      tagIds: defaultValues?.tagIds ?? [],
    },
  });

  function submit(values: Partial<CreateCustomerInput>) {
    onSubmit({ ...values, tagIds: values.tagIds ?? [] } as CreateCustomerInput);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="cust-name">Name</Label>
        <Input id="cust-name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cust-email">Email</Label>
          <Input id="cust-email" type="email" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="cust-phone">Phone</Label>
          <Input id="cust-phone" type="tel" {...register("phone")} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cust-notes">Notes</Label>
        <Textarea id="cust-notes" rows={3} {...register("notes")} />
      </div>
      <div className="space-y-2">
        <Label>Tags</Label>
        <Controller
          control={control}
          name="tagIds"
          render={({ field }) => <TagPicker value={field.value ?? []} onChange={field.onChange} />}
        />
      </div>
      <DialogFooter>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

export function CustomersManager() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerWithTags | null>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: CUSTOMERS_KEY,
    queryFn: async () => {
      const result = await listCustomers();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<CustomerWithTags[]>(CUSTOMERS_KEY, (prev) => [...(prev ?? []), result.data]);
      toast.success("Customer added");
      setCreateOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const updateMutation = useMutation({
    mutationFn: updateCustomer,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<CustomerWithTags[]>(CUSTOMERS_KEY, (prev) =>
        (prev ?? []).map((c) => (c.id === result.data.id ? result.data : c)),
      );
      toast.success("Customer updated");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<CustomerWithTags[]>(CUSTOMERS_KEY, (prev) =>
        (prev ?? []).filter((c) => c.id !== variables.id),
      );
      toast.success("Customer deleted");
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">People who have done business with you.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>Add customer</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New customer</DialogTitle>
            </DialogHeader>
            <CustomerForm submitLabel="Create" onSubmit={(values) => createMutation.mutate(values)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {customers && customers.length === 0 && (
        <p className="text-sm text-muted-foreground">No customers yet. Add your first one above.</p>
      )}

      {customers && customers.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium">{customer.name}</TableCell>
                <TableCell>{customer.email || customer.phone || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {customer.tags.map((tag) => (
                      <Badge key={tag.id} style={{ backgroundColor: tag.color }} className="text-white">
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(customer)}>
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      Delete
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: customer.id })}>
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
            <DialogTitle>Edit customer</DialogTitle>
          </DialogHeader>
          {editing && (
            <CustomerForm
              submitLabel="Save"
              defaultValues={{
                name: editing.name,
                email: editing.email ?? "",
                phone: editing.phone ?? "",
                notes: editing.notes ?? "",
                tagIds: editing.tags.map((t) => t.id),
              }}
              onSubmit={(values) => updateMutation.mutate({ ...values, id: editing.id })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
