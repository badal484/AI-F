"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { LEAD_SOURCES, LEAD_STAGES, type CreateLeadInput } from "@aif/shared";
import {
  createLead,
  deleteLead,
  listAssignableUsers,
  listLeads,
  updateLead,
  updateLeadStage,
  type LeadWithTags,
} from "@/domains/crm/leads/actions";
import { listCustomers } from "@/domains/crm/customers/actions";
import { TagPicker } from "@/domains/crm/components/tag-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const LEADS_KEY = ["leads"] as const;
const CUSTOMERS_KEY = ["customers"] as const;
const ASSIGNABLE_USERS_KEY = ["assignable-users"] as const;
const NONE = "__none__";

const STAGE_LABELS: Record<(typeof LEAD_STAGES)[number], string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  WON: "Won",
  LOST: "Lost",
};

const STAGE_VARIANTS: Record<(typeof LEAD_STAGES)[number], "secondary" | "outline" | "destructive"> = {
  NEW: "outline",
  CONTACTED: "outline",
  QUALIFIED: "secondary",
  WON: "secondary",
  LOST: "destructive",
};

function formatValue(cents: number | null) {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

const leadFormSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().max(255).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  source: z.enum(LEAD_SOURCES),
  valueDollars: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  customerId: z.string().optional().or(z.literal("")),
  assignedToId: z.string().optional().or(z.literal("")),
  tagIds: z.array(z.string()),
});
type LeadFormValues = z.infer<typeof leadFormSchema>;

function LeadForm({
  defaultValues,
  onSubmit,
  submitLabel,
}: {
  defaultValues?: Partial<CreateLeadInput> & { valueDollars?: string };
  onSubmit: (values: CreateLeadInput) => void;
  submitLabel: string;
}) {
  const { data: customers } = useQuery({
    queryKey: CUSTOMERS_KEY,
    queryFn: async () => {
      const result = await listCustomers();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
  const { data: users } = useQuery({
    queryKey: ASSIGNABLE_USERS_KEY,
    queryFn: async () => {
      const result = await listAssignableUsers();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      source: defaultValues?.source ?? "OTHER",
      notes: defaultValues?.notes ?? "",
      customerId: defaultValues?.customerId ?? "",
      assignedToId: defaultValues?.assignedToId ?? "",
      tagIds: defaultValues?.tagIds ?? [],
      valueDollars: defaultValues?.valueDollars ?? "",
    },
  });

  function submit(values: LeadFormValues) {
    const { valueDollars, ...rest } = values;
    onSubmit({
      ...rest,
      valueCents: valueDollars ? Math.round(parseFloat(valueDollars) * 100) : undefined,
    } as CreateLeadInput);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="lead-name">Name</Label>
        <Input id="lead-name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="lead-email">Email</Label>
          <Input id="lead-email" type="email" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-phone">Phone</Label>
          <Input id="lead-phone" type="tel" {...register("phone")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Source</Label>
          <Controller
            control={control}
            name="source"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-value">Estimated value (USD)</Label>
          <Input id="lead-value" type="number" min={0} step="0.01" {...register("valueDollars")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Linked customer</Label>
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <Select
                value={field.value || NONE}
                onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {customers?.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label>Assigned to</Label>
          <Controller
            control={control}
            name="assignedToId"
            render={({ field }) => (
              <Select
                value={field.value || NONE}
                onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-notes">Notes</Label>
        <Textarea id="lead-notes" rows={3} {...register("notes")} />
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

export function LeadsManager() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<LeadWithTags | null>(null);

  const { data: leads, isLoading } = useQuery({
    queryKey: LEADS_KEY,
    queryFn: async () => {
      const result = await listLeads();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: createLead,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<LeadWithTags[]>(LEADS_KEY, (prev) => [...(prev ?? []), result.data]);
      toast.success("Lead added");
      setCreateOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const updateMutation = useMutation({
    mutationFn: updateLead,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<LeadWithTags[]>(LEADS_KEY, (prev) =>
        (prev ?? []).map((l) => (l.id === result.data.id ? result.data : l)),
      );
      toast.success("Lead updated");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const stageMutation = useMutation({
    mutationFn: updateLeadStage,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: LEADS_KEY });
      const previous = queryClient.getQueryData<LeadWithTags[]>(LEADS_KEY);
      queryClient.setQueryData<LeadWithTags[]>(LEADS_KEY, (prev) =>
        (prev ?? []).map((l) => (l.id === variables.id ? { ...l, stage: variables.stage } : l)),
      );
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(LEADS_KEY, context.previous);
      toast.error("Something went wrong");
    },
    onSuccess: (result) => {
      if ("error" in result) toast.error(result.error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLead,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<LeadWithTags[]>(LEADS_KEY, (prev) => (prev ?? []).filter((l) => l.id !== variables.id));
      toast.success("Lead deleted");
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">Prospects moving through your pipeline.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>Add lead</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New lead</DialogTitle>
            </DialogHeader>
            <LeadForm submitLabel="Create" onSubmit={(values) => createMutation.mutate(values)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {leads && leads.length === 0 && (
        <p className="text-sm text-muted-foreground">No leads yet. Add your first one above.</p>
      )}

      {leads && leads.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{lead.source}</Badge>
                </TableCell>
                <TableCell>{formatValue(lead.valueCents)}</TableCell>
                <TableCell>
                  <Select
                    value={lead.stage}
                    onValueChange={(stage) =>
                      stageMutation.mutate({ id: lead.id, stage: stage as (typeof LEAD_STAGES)[number] })
                    }
                  >
                    <SelectTrigger size="sm" className="w-36">
                      <SelectValue>
                        <Badge variant={STAGE_VARIANTS[lead.stage]}>{STAGE_LABELS[lead.stage]}</Badge>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {STAGE_LABELS[stage]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(lead)}>
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      Delete
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {lead.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: lead.id })}>
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
            <DialogTitle>Edit lead</DialogTitle>
          </DialogHeader>
          {editing && (
            <LeadForm
              submitLabel="Save"
              defaultValues={{
                name: editing.name,
                email: editing.email ?? "",
                phone: editing.phone ?? "",
                source: editing.source,
                notes: editing.notes ?? "",
                customerId: editing.customerId ?? "",
                assignedToId: editing.assignedToId ?? "",
                tagIds: editing.tags.map((t) => t.id),
                valueDollars: editing.valueCents !== null ? (editing.valueCents / 100).toString() : "",
              }}
              onSubmit={(values) => updateMutation.mutate({ ...values, id: editing.id })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
