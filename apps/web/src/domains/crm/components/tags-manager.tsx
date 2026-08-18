"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createTagSchema, type CreateTagInput } from "@aif/shared";
import type { Tag } from "@aif/db";
import { createTag, deleteTag, listTags } from "@/domains/crm/tags/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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

export const TAGS_KEY = ["tags"] as const;

export function TagsManager() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tags, isLoading } = useQuery({
    queryKey: TAGS_KEY,
    queryFn: async () => {
      const result = await listTags();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createTagSchema),
    defaultValues: { name: "", color: "#6b7280" },
  });

  function submit(values: Partial<CreateTagInput>) {
    createMutation.mutate({ name: values.name ?? "", color: values.color ?? "#6b7280" });
  }

  const createMutation = useMutation({
    mutationFn: createTag,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<Tag[]>(TAGS_KEY, (prev) => [...(prev ?? []), result.data]);
      toast.success("Tag created");
      reset();
      setCreateOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTag,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<Tag[]>(TAGS_KEY, (prev) => (prev ?? []).filter((t) => t.id !== variables.id));
      toast.success("Tag deleted");
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-sm text-muted-foreground">Labels you can attach to customers and leads.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>Add tag</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New tag</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="tag-name">Name</Label>
                <Input id="tag-name" {...register("name")} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tag-color">Color</Label>
                <Input id="tag-color" type="color" className="h-10 w-20 p-1" {...register("color")} />
                {errors.color && <p className="text-sm text-destructive">{errors.color.message}</p>}
              </div>
              <DialogFooter>
                <Button type="submit">Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Skeleton className="h-24 w-full" />}

      {tags && tags.length === 0 && <p className="text-sm text-muted-foreground">No tags yet.</p>}

      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 rounded-full border py-1 pr-1 pl-3 text-sm">
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.name}
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="ghost" size="icon-xs" className="rounded-full" />}>
                  ×
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete tag &ldquo;{tag.name}&rdquo;?</AlertDialogTitle>
                    <AlertDialogDescription>
                      It will be removed from any customers or leads it&apos;s attached to.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate({ id: tag.id })}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
