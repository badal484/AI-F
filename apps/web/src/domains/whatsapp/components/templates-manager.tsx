"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createWhatsAppTemplateSchema, type CreateWhatsAppTemplateInput } from "@aif/shared";
import type { WhatsAppTemplate } from "@aif/db";
import {
  createWhatsAppTemplate,
  deleteWhatsAppTemplate,
  listWhatsAppTemplates,
} from "@/domains/whatsapp/templates/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const WHATSAPP_TEMPLATES_KEY = ["whatsapp-templates"] as const;

function NewTemplateDialog({ onCreated }: { onCreated: (template: WhatsAppTemplate) => void }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createWhatsAppTemplateSchema),
    defaultValues: { name: "", language: "en_US", bodyText: "" },
  });

  const mutation = useMutation({
    mutationFn: createWhatsAppTemplate,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onCreated(result.data);
      toast.success("Template added");
      reset();
      setOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  function submit(values: Partial<CreateWhatsAppTemplateInput>) {
    mutation.mutate({
      name: values.name ?? "",
      language: values.language ?? "en_US",
      bodyText: values.bodyText ?? "",
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add template</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New WhatsApp template</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <p className="text-sm text-muted-foreground">
            Must exactly match a template already approved in Meta Business Manager.
          </p>
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Template name</Label>
            <Input id="tpl-name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-language">Language code</Label>
            <Input id="tpl-language" placeholder="en_US" {...register("language")} />
            {errors.language && <p className="text-sm text-destructive">{errors.language.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-body">Body text</Label>
            <Textarea
              id="tpl-body"
              rows={3}
              placeholder="Hi {{1}}, your appointment is confirmed for {{2}}."
              {...register("bodyText")}
            />
            <p className="text-xs text-muted-foreground">Use {"{{1}}"}, {"{{2}}"}, … for variables.</p>
            {errors.bodyText && <p className="text-sm text-destructive">{errors.bodyText.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Adding…" : "Add template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TemplatesManager() {
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: WHATSAPP_TEMPLATES_KEY,
    queryFn: async () => {
      const result = await listWhatsAppTemplates();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWhatsAppTemplate,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<WhatsAppTemplate[]>(WHATSAPP_TEMPLATES_KEY, (prev) =>
        (prev ?? []).filter((t) => t.id !== variables.id),
      );
      toast.success("Template deleted");
    },
    onError: () => toast.error("Something went wrong"),
  });

  function handleCreated(template: WhatsAppTemplate) {
    queryClient.setQueryData<WhatsAppTemplate[]>(WHATSAPP_TEMPLATES_KEY, (prev) => [...(prev ?? []), template]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">WhatsApp templates</h1>
          <p className="text-sm text-muted-foreground">
            Pre-approved messages usable outside the 24-hour reply window.
          </p>
        </div>
        <NewTemplateDialog onCreated={handleCreated} />
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}

      {templates && templates.length === 0 && (
        <p className="text-sm text-muted-foreground">No templates yet. Add one that&apos;s already approved in Meta Business Manager.</p>
      )}

      {templates && templates.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Body</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">{template.name}</TableCell>
                <TableCell>{template.language}</TableCell>
                <TableCell className="max-w-md truncate">{template.bodyText}</TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      Delete
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{template.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: template.id })}>
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
    </div>
  );
}
