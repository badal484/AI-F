"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { CONVERSATION_CHANNELS, type CreateConversationInput } from "@aif/shared";
import {
  createConversation,
  listConversations,
  type ConversationSummary,
} from "@/domains/inbox/conversations/actions";
import { listCustomers } from "@/domains/crm/customers/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const CONVERSATIONS_KEY = ["conversations"] as const;
const CUSTOMERS_KEY = ["customers"] as const;
const NONE = "__none__";

const STATUS_VARIANTS: Record<ConversationSummary["status"], "secondary" | "outline" | "destructive"> = {
  OPEN: "secondary",
  HUMAN_REQUIRED: "destructive",
  CLOSED: "outline",
};

const newConversationSchema = z.object({
  customerId: z.string().optional().or(z.literal("")),
  channel: z.enum(CONVERSATION_CHANNELS),
  initialMessage: z.string().min(1, "Enter what the customer said"),
});
type NewConversationValues = z.infer<typeof newConversationSchema>;

function NewConversationDialog({ onCreated }: { onCreated: (conversation: ConversationSummary) => void }) {
  const [open, setOpen] = useState(false);
  const { data: customers } = useQuery({
    queryKey: CUSTOMERS_KEY,
    queryFn: async () => {
      const result = await listCustomers();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NewConversationValues>({
    resolver: zodResolver(newConversationSchema),
    defaultValues: { customerId: "", channel: "MANUAL", initialMessage: "" },
  });

  const mutation = useMutation({
    mutationFn: createConversation,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onCreated(result.data);
      toast.success("Conversation started");
      reset();
      setOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  function submit(values: NewConversationValues) {
    mutation.mutate(values as CreateConversationInput);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>New</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a conversation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label>Customer</Label>
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Unknown / not yet in CRM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unknown / not yet in CRM</SelectItem>
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
            <Label>Channel</Label>
            <Controller
              control={control}
              name="channel"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONVERSATION_CHANNELS.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {channel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="initial-message">What did the customer say?</Label>
            <Textarea id="initial-message" rows={3} {...register("initialMessage")} />
            {errors.initialMessage && (
              <p className="text-sm text-destructive">{errors.initialMessage.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Starting…" : "Start conversation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const queryClient = useQueryClient();

  const { data: conversations, isLoading } = useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: async () => {
      const result = await listConversations();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  function handleCreated(conversation: ConversationSummary) {
    queryClient.setQueryData<ConversationSummary[]>(CONVERSATIONS_KEY, (prev) => [conversation, ...(prev ?? [])]);
    onSelect(conversation.id);
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="font-semibold">Inbox</h2>
        <NewConversationDialog onCreated={handleCreated} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-2 p-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {conversations && conversations.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>
        )}

        {conversations?.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation.id)}
            className={cn(
              "flex w-full flex-col gap-1 border-b p-3 text-left transition-colors hover:bg-muted",
              selectedId === conversation.id && "bg-muted",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {conversation.customer?.name ?? conversation.lead?.name ?? "Unknown"}
              </span>
              <Badge variant={STATUS_VARIANTS[conversation.status]} className="text-xs">
                {conversation.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="line-clamp-1 text-sm text-muted-foreground">
              {conversation.messages[0]?.body ?? "No messages"}
            </p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{conversation.channel}</span>
              <span>{conversation.assignedTo ? conversation.assignedTo.name || conversation.assignedTo.email : "Unassigned"}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
