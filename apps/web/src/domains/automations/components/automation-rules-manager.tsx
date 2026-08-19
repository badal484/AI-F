"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AutomationRule } from "@aif/db";
import type { CreateAutomationRuleInput } from "@aif/shared";
import {
  createAutomationRule,
  deleteAutomationRule,
  listAutomationRules,
  toggleAutomationRule,
} from "@/domains/automations/rules/actions";
import { listWhatsAppTemplates } from "@/domains/whatsapp/templates/actions";
import { WHATSAPP_TEMPLATES_KEY } from "@/domains/whatsapp/components/templates-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export const AUTOMATION_RULES_KEY = ["automation-rules"] as const;

const TRIGGER_LABELS: Record<string, string> = {
  APPOINTMENT_CREATED: "Appointment booked",
  LEAD_CREATED: "Lead created",
  LEAD_STAGE_CHANGED: "Lead stage changed",
};

const ACTION_LABELS: Record<string, string> = {
  SEND_WHATSAPP_TEMPLATE: "Send WhatsApp template",
  CREATE_REMINDER: "Create reminder",
};

const LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"] as const;

function describeDelay(trigger: string, delayMinutes: number): string {
  if (delayMinutes === 0) return "Immediately";
  const unit = delayMinutes % 60 === 0 ? `${delayMinutes / 60}h` : `${delayMinutes}m`;
  return trigger === "APPOINTMENT_CREATED" ? `${unit} before start` : `${unit} after`;
}

function NewRuleDialog({ onCreated }: { onCreated: (rule: AutomationRule) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<CreateAutomationRuleInput["trigger"]>("APPOINTMENT_CREATED");
  const [triggerStage, setTriggerStage] = useState("");
  const [delayMinutes, setDelayMinutes] = useState("60");
  const [actionType, setActionType] = useState<CreateAutomationRuleInput["actionType"]>("SEND_WHATSAPP_TEMPLATE");
  const [whatsappTemplateId, setWhatsappTemplateId] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");

  const { data: templates } = useQuery({
    queryKey: WHATSAPP_TEMPLATES_KEY,
    queryFn: async () => {
      const result = await listWhatsAppTemplates();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const mutation = useMutation({
    mutationFn: createAutomationRule,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onCreated(result.data);
      toast.success("Automation rule created");
      setOpen(false);
      setName("");
      setTriggerStage("");
      setDelayMinutes("60");
      setWhatsappTemplateId("");
      setReminderTitle("");
    },
    onError: () => toast.error("Something went wrong"),
  });

  function submit() {
    mutation.mutate({
      name,
      trigger,
      triggerStage:
        trigger === "LEAD_STAGE_CHANGED" && triggerStage
          ? (triggerStage as CreateAutomationRuleInput["triggerStage"])
          : undefined,
      delayMinutes: Number(delayMinutes) || 0,
      actionType,
      whatsappTemplateId: actionType === "SEND_WHATSAPP_TEMPLATE" ? whatsappTemplateId : "",
      reminderTitle: actionType === "CREATE_REMINDER" ? reminderTitle : "",
      isEnabled: true,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New automation</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New automation rule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Appointment reminder" />
          </div>

          <div className="space-y-2">
            <Label>When</Label>
            <Select value={trigger} onValueChange={(v) => v && setTrigger(v as typeof trigger)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {trigger === "LEAD_STAGE_CHANGED" && (
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={triggerStage} onValueChange={(v) => setTriggerStage(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a stage" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rule-delay">
              Delay (minutes) — {trigger === "APPOINTMENT_CREATED" ? "before the appointment starts" : "after the trigger"}
            </Label>
            <Input
              id="rule-delay"
              type="number"
              min={0}
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Then</Label>
            <Select value={actionType} onValueChange={(v) => v && setActionType(v as typeof actionType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {actionType === "SEND_WHATSAPP_TEMPLATE" && (
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={whatsappTemplateId} onValueChange={(v) => setWhatsappTemplateId(v ?? "")}>
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
              {templates && templates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No templates yet — add one on the WhatsApp Templates page first.
                </p>
              )}
            </div>
          )}

          {actionType === "CREATE_REMINDER" && (
            <div className="space-y-2">
              <Label htmlFor="rule-reminder-title">Reminder title</Label>
              <Input
                id="rule-reminder-title"
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                placeholder="Follow up with lead"
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" disabled={!name || mutation.isPending} onClick={submit}>
              {mutation.isPending ? "Creating…" : "Create automation"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AutomationRulesManager() {
  const queryClient = useQueryClient();

  const { data: rules, isLoading } = useQuery({
    queryKey: AUTOMATION_RULES_KEY,
    queryFn: async () => {
      const result = await listAutomationRules();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleAutomationRule,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<AutomationRule[]>(AUTOMATION_RULES_KEY, (prev) =>
        (prev ?? []).map((r) => (r.id === result.data.id ? result.data : r)),
      );
    },
    onError: () => toast.error("Something went wrong"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAutomationRule,
    onSuccess: (result, variables) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<AutomationRule[]>(AUTOMATION_RULES_KEY, (prev) =>
        (prev ?? []).filter((r) => r.id !== variables.id),
      );
      toast.success("Automation deleted");
    },
    onError: () => toast.error("Something went wrong"),
  });

  function handleCreated(rule: AutomationRule) {
    queryClient.setQueryData<AutomationRule[]>(AUTOMATION_RULES_KEY, (prev) => [...(prev ?? []), rule]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Trigger reminders and follow-ups automatically from appointments and leads.
          </p>
        </div>
        <NewRuleDialog onCreated={handleCreated} />
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}

      {rules && rules.length === 0 && (
        <p className="text-sm text-muted-foreground">No automations yet. Create one to get started.</p>
      )}

      {rules && rules.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Delay</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{TRIGGER_LABELS[rule.trigger]}</span>
                    {rule.triggerStage && (
                      <Badge variant="outline" className="w-fit">
                        {rule.triggerStage}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{describeDelay(rule.trigger, rule.delayMinutes)}</TableCell>
                <TableCell>{ACTION_LABELS[rule.actionType]}</TableCell>
                <TableCell>
                  <Switch
                    checked={rule.isEnabled}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, isEnabled: checked })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Delete</AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{rule.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This cannot be undone. Any runs already scheduled for this rule will be skipped when they
                          come due.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: rule.id })}>
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
