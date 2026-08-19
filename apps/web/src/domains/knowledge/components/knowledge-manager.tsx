"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createDocumentSchema, searchKnowledgeSchema, type CreateDocumentInput, type SearchKnowledgeInput } from "@aif/shared";
import type { DocumentStatus } from "@aif/db";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  testKnowledgeSearch,
  type DocumentWithChunkCount,
} from "@/domains/knowledge/documents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const DOCUMENTS_KEY = ["knowledge-documents"] as const;

const STATUS_VARIANTS: Record<DocumentStatus, "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  READY: "secondary",
  FAILED: "destructive",
};

function NewDocumentDialog({ onCreated }: { onCreated: (doc: DocumentWithChunkCount) => void }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateDocumentInput>({
    resolver: zodResolver(createDocumentSchema),
    defaultValues: { title: "", content: "" },
  });

  const mutation = useMutation({
    mutationFn: createDocument,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onCreated(result.data);
      if (result.data.status === "FAILED") {
        toast.error(result.data.error ?? "Failed to embed document");
      } else {
        toast.success(`Document embedded into ${result.data._count.chunks} chunks`);
      }
      reset();
      setOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add document</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New knowledge document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input id="doc-title" placeholder="Cancellation policy" {...register("title")} />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-content">Content</Label>
            <Textarea id="doc-content" rows={8} placeholder="Paste the text you want the AI to know…" {...register("content")} />
            {errors.content && <p className="text-sm text-destructive">{errors.content.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Embedding…" : "Add & embed"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TestSearchPanel() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SearchKnowledgeInput>({ resolver: zodResolver(searchKnowledgeSchema), defaultValues: { query: "" } });

  const mutation = useMutation({ mutationFn: testKnowledgeSearch });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test search</CardTitle>
        <CardDescription>See what the AI would find for a customer&apos;s question.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex gap-2" noValidate>
          <div className="flex-1">
            <Input placeholder="What are your cancellation fees?" {...register("query")} />
            {errors.query && <p className="text-sm text-destructive">{errors.query.message}</p>}
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Searching…" : "Search"}
          </Button>
        </form>

        {mutation.data &&
          ("error" in mutation.data ? (
            <p className="text-sm text-destructive">{mutation.data.error}</p>
          ) : mutation.data.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching chunks found.</p>
          ) : (
            <ul className="space-y-2">
              {mutation.data.data.map((result) => (
                <li key={result.id} className="rounded-md border p-3 text-sm">
                  <div className="mb-1 text-xs text-muted-foreground">
                    relevance {(1 - result.distance).toFixed(2)}
                  </div>
                  {result.content}
                </li>
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}

export function KnowledgeManager() {
  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery({
    queryKey: DOCUMENTS_KEY,
    queryFn: async () => {
      const result = await listDocuments();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<DocumentWithChunkCount[]>(DOCUMENTS_KEY, (prev) =>
        (prev ?? []).filter((d) => d.id !== variables.id),
      );
      toast.success("Document deleted");
    },
    onError: () => toast.error("Something went wrong"),
  });

  function handleCreated(doc: DocumentWithChunkCount) {
    queryClient.setQueryData<DocumentWithChunkCount[]>(DOCUMENTS_KEY, (prev) => [doc, ...(prev ?? [])]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge base</h1>
          <p className="text-sm text-muted-foreground">
            What the AI can reference when answering customers (Phase 6 — RAG).
          </p>
        </div>
        <NewDocumentDialog onCreated={handleCreated} />
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {documents && documents.length === 0 && (
        <p className="text-sm text-muted-foreground">No documents yet. Add your first one above.</p>
      )}

      {documents && documents.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">{doc.title}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[doc.status]} title={doc.error ?? undefined}>
                    {doc.status}
                  </Badge>
                </TableCell>
                <TableCell>{doc._count.chunks}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      Delete
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{doc.title}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: doc.id })}>
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

      <TestSearchPanel />
    </div>
  );
}
