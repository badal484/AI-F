"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { tenantProfileSchema } from "@aif/shared";
import type { Tenant } from "@aif/db";
import { updateTenantProfile } from "@/domains/business-core/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export function SettingsForm({ tenant }: { tenant: Tenant }) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(tenantProfileSchema),
    defaultValues: {
      name: tenant.name,
      timezone: tenant.timezone,
      phone: tenant.phone ?? "",
      website: tenant.website ?? "",
      description: tenant.description ?? "",
      whatsappPhoneNumberId: tenant.whatsappPhoneNumberId ?? "",
      voicePhoneNumber: tenant.voicePhoneNumber ?? "",
      widgetEnabled: tenant.widgetEnabled,
      widgetAllowedOrigins: tenant.widgetAllowedOrigins,
    },
  });

  const mutation = useMutation({
    mutationFn: updateTenantProfile,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated");
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Business name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input id="timezone" placeholder="America/New_York" {...register("timezone")} />
        {errors.timezone && <p className="text-sm text-destructive">{errors.timezone.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" type="tel" {...register("phone")} />
        {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="website">Website</Label>
        <Input id="website" type="url" placeholder="https://example.com" {...register("website")} />
        {errors.website && <p className="text-sm text-destructive">{errors.website.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} {...register("description")} />
        {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="whatsapp-phone-number-id">WhatsApp phone number ID</Label>
        <Input
          id="whatsapp-phone-number-id"
          placeholder="From Meta Business Manager"
          {...register("whatsappPhoneNumberId")}
        />
        <p className="text-xs text-muted-foreground">
          The Meta phone_number_id for this business&apos;s WhatsApp number, not the phone number itself.
        </p>
        {errors.whatsappPhoneNumberId && (
          <p className="text-sm text-destructive">{errors.whatsappPhoneNumberId.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="voice-phone-number">Voice phone number</Label>
        <Input id="voice-phone-number" placeholder="+15551234567" {...register("voicePhoneNumber")} />
        <p className="text-xs text-muted-foreground">
          The Twilio phone number this business receives calls on, in E.164 format.
        </p>
        {errors.voicePhoneNumber && <p className="text-sm text-destructive">{errors.voicePhoneNumber.message}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="widgetEnabled"
          render={({ field }) => (
            <Switch id="widget-enabled" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
        <Label htmlFor="widget-enabled">Website chat widget enabled</Label>
      </div>
      <div className="space-y-2">
        <Label htmlFor="widget-origins">Allowed origins</Label>
        <Controller
          control={control}
          name="widgetAllowedOrigins"
          render={({ field }) => (
            <Textarea
              id="widget-origins"
              rows={3}
              placeholder={"https://example.com\nhttps://www.example.com"}
              value={(field.value ?? []).join("\n")}
              onChange={(e) =>
                field.onChange(
                  e.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean),
                )
              }
            />
          )}
        />
        <p className="text-xs text-muted-foreground">
          One origin per line — scheme and host only, no path (e.g. https://example.com). The widget only works when
          embedded on a page whose origin is listed here.
        </p>
        {errors.widgetAllowedOrigins && (
          <p className="text-sm text-destructive">
            {Array.isArray(errors.widgetAllowedOrigins)
              ? errors.widgetAllowedOrigins.find((e) => e?.message)?.message
              : errors.widgetAllowedOrigins.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
