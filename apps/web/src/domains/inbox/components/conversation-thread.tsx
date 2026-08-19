"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CONVERSATION_STATUSES, MESSAGE_SENDER_INPUTS } from "@aif/shared";
import {
  assignConversation,
  listConversations,
  updateConversationStatus,
  type ConversationSummary,
} from "@/domains/inbox/conversations/actions";
import { listMessages, sendMessage, type MessageWithSender } from "@/domains/inbox/messages/actions";
import { detectConversationIntent, generateDraftReply } from "@/domains/ai-agent/actions";
import { listAssignableUsers } from "@/domains/auth/users";
import { SendTemplateDialog } from "@/domains/whatsapp/components/send-template-dialog";
import { CONVERSATIONS_KEY } from "@/domains/inbox/components/conversation-list";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ASSIGNABLE_USERS_KEY = ["assignable-users"] as const;
const NONE = "__none__";

const STATUS_LABELS: Record<(typeof CONVERSATION_STATUSES)[number], string> = {
  OPEN: "Open",
  HUMAN_REQUIRED: "Needs human",
  CLOSED: "Closed",
};

function messagesKey(conversationId: string) {
  return ["messages", conversationId] as const;
}

async function fetchAssignableUsers() {
  const result = await listAssignableUsers();
  if ("error" in result) throw new Error(result.error);
  return result.data;
}

export function ConversationThread({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [senderType, setSenderType] = useState<(typeof MESSAGE_SENDER_INPUTS)[number]>("STAFF");
  const [intentFor, setIntentFor] = useState<string | null>(null);

  const intentMutation = useMutation({
    mutationFn: detectConversationIntent,
    onError: () => toast.error("Something went wrong"),
  });
  const draftMutation = useMutation({
    mutationFn: generateDraftReply,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setDraft(result.data.text);
      setSenderType("STAFF");
      if (result.data.escalated) toast.info("AI escalated this conversation to a human");
      if (result.data.leadCaptured) toast.info("AI captured a new lead from this conversation");
    },
    onError: () => toast.error("Something went wrong"),
  });

  // Discard a previous conversation's intent result when switching threads —
  // an "adjust state during render" reset (not an effect), see the same
  // pattern in location-hours-editor.tsx.
  if (intentFor !== conversationId && (intentMutation.data || intentMutation.isPending)) {
    setIntentFor(conversationId);
    intentMutation.reset();
  }

  const { data: conversations } = useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: async () => {
      const result = await listConversations();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
  const conversation = conversations?.find((c) => c.id === conversationId);

  const { data: users } = useQuery({ queryKey: ASSIGNABLE_USERS_KEY, queryFn: fetchAssignableUsers });

  const { data: messages, isLoading } = useQuery({
    queryKey: messagesKey(conversationId),
    queryFn: async () => {
      const result = await listMessages(conversationId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  function patchConversation(patch: Partial<ConversationSummary>) {
    queryClient.setQueryData<ConversationSummary[]>(CONVERSATIONS_KEY, (prev) =>
      (prev ?? []).map((c) => (c.id === conversationId ? { ...c, ...patch } : c)),
    );
  }

  function appendSentMessage(message: MessageWithSender) {
    queryClient.setQueryData<MessageWithSender[]>(messagesKey(conversationId), (prev) => [
      ...(prev ?? []),
      message,
    ]);
    patchConversation({ messages: [{ body: message.body, createdAt: message.createdAt }] });
  }

  const sendMutation = useMutation({
    mutationFn: sendMessage,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      appendSentMessage(result.data);
      setDraft("");
    },
    onError: () => toast.error("Something went wrong"),
  });

  const assignMutation = useMutation({
    mutationFn: assignConversation,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      patchConversation({ assignedToId: result.data.assignedToId, assignedTo: result.data.assignedTo });
      toast.success("Assignment updated");
    },
    onError: () => toast.error("Something went wrong"),
  });

  const statusMutation = useMutation({
    mutationFn: updateConversationStatus,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      patchConversation({ status: result.data.status });
      toast.success("Status updated");
    },
    onError: () => toast.error("Something went wrong"),
  });

  if (!conversation) {
    return <Skeleton className="m-4 h-full" />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b p-3">
        <div>
          <p className="font-medium">{conversation.customer?.name ?? conversation.lead?.name ?? "Unknown"}</p>
          <p className="text-xs text-muted-foreground">{conversation.channel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={conversation.assignedToId ?? NONE}
            onValueChange={(value) =>
              assignMutation.mutate({ id: conversationId, assignedToId: !value || value === NONE ? "" : value })
            }
          >
            <SelectTrigger size="sm" className="w-40">
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
          <Select
            value={conversation.status}
            onValueChange={(status) =>
              statusMutation.mutate({ id: conversationId, status: status as ConversationSummary["status"] })
            }
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue>
                <Badge variant={conversation.status === "HUMAN_REQUIRED" ? "destructive" : "secondary"}>
                  {STATUS_LABELS[conversation.status]}
                </Badge>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CONVERSATION_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading && <Skeleton className="h-full w-full" />}
        {messages?.map((message) => (
          <div
            key={message.id}
            className={cn("flex flex-col gap-1", message.senderType === "STAFF" ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "max-w-md rounded-lg px-3 py-2 text-sm",
                message.senderType === "STAFF" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {message.body}
            </div>
            <span className="text-xs text-muted-foreground">
              {message.senderType === "STAFF" ? message.sender?.name || message.sender?.email || "Staff" : "Customer"}
              {" · "}
              {new Date(message.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={intentMutation.isPending || !messages?.some((m) => m.senderType === "CUSTOMER")}
          onClick={() => {
            const lastCustomerMessage = [...(messages ?? [])].reverse().find((m) => m.senderType === "CUSTOMER");
            if (lastCustomerMessage) intentMutation.mutate(lastCustomerMessage.body);
          }}
        >
          {intentMutation.isPending ? "Detecting…" : "Detect intent"}
        </Button>
        {intentMutation.data &&
          (("error" in intentMutation.data) ? (
            <span className="text-xs text-destructive">{intentMutation.data.error}</span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant={intentMutation.data.data.isFrustrated ? "destructive" : "outline"}>
                {intentMutation.data.data.intent}
              </Badge>
              {intentMutation.data.data.reasoning}
            </span>
          ))}
        {conversation.channel === "WHATSAPP" && (
          <SendTemplateDialog conversationId={conversationId} onSent={appendSentMessage} />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={draftMutation.isPending || !messages?.length}
          onClick={() => draftMutation.mutate(conversationId)}
        >
          {draftMutation.isPending ? "Drafting…" : "Draft AI reply"}
        </Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          sendMutation.mutate({ conversationId, senderType, body: draft });
        }}
        className="flex flex-col gap-2 border-t p-3"
      >
        <div className="flex items-center gap-2">
          <Select value={senderType} onValueChange={(v) => setSenderType(v as typeof senderType)}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STAFF">Reply as staff</SelectItem>
              <SelectItem value="CUSTOMER">Log customer message</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            rows={2}
            className="flex-1"
          />
          <Button type="submit" disabled={sendMutation.isPending || !draft.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
