"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MessageWithSender } from "@/domains/inbox/messages/actions";
import { listWhatsAppTemplates, sendWhatsAppTemplateToConversation } from "@/domains/whatsapp/templates/actions";
import { WHATSAPP_TEMPLATES_KEY } from "@/domains/whatsapp/components/templates-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

function placeholderCount(bodyText: string): number {
  const matches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return matches.length > 0 ? Math.max(...matches) : 0;
}

export function SendTemplateDialog({
  conversationId,
  onSent,
}: {
  conversationId: string;
  onSent: (message: MessageWithSender) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [params, setParams] = useState<string[]>([]);

  const { data: templates } = useQuery({
    queryKey: WHATSAPP_TEMPLATES_KEY,
    queryFn: async () => {
      const result = await listWhatsAppTemplates();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const selectedTemplate = templates?.find((t) => t.id === templateId);
  const count = useMemo(() => (selectedTemplate ? placeholderCount(selectedTemplate.bodyText) : 0), [selectedTemplate]);

  const mutation = useMutation({
    mutationFn: sendWhatsAppTemplateToConversation,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onSent(result.data);
      toast.success("Template sent");
      setTemplateId("");
      setParams([]);
      setOpen(false);
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Send template</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a template message</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use this outside the 24-hour reply window, when a regular message would be rejected.
          </p>
          <div className="space-y-2">
            <Label>Template</Label>
            <Select
              value={templateId}
              onValueChange={(value) => {
                setTemplateId(value ?? "");
                setParams([]);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedTemplate && (
            <p className="rounded-md border bg-muted/30 p-2 text-sm text-muted-foreground">
              {selectedTemplate.bodyText}
            </p>
          )}
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="space-y-2">
              <Label htmlFor={`tpl-param-${i}`}>{`{{${i + 1}}}`}</Label>
              <Input
                id={`tpl-param-${i}`}
                value={params[i] ?? ""}
                onChange={(e) => {
                  const next = [...params];
                  next[i] = e.target.value;
                  setParams(next);
                }}
              />
            </div>
          ))}
          <DialogFooter>
            <Button
              type="button"
              disabled={!templateId || mutation.isPending}
              onClick={() => mutation.mutate({ conversationId, templateId, params })}
            >
              {mutation.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
