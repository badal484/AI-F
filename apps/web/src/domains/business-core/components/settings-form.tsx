"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { tenantProfileSchema, type TenantProfileInput } from "@aif/shared";
import type { Tenant } from "@aif/db";
import { updateTenantProfile } from "@/domains/business-core/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SettingsForm({ tenant }: { tenant: Tenant }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TenantProfileInput>({
    resolver: zodResolver(tenantProfileSchema),
    defaultValues: {
      name: tenant.name,
      timezone: tenant.timezone,
      phone: tenant.phone ?? "",
      website: tenant.website ?? "",
      description: tenant.description ?? "",
      whatsappPhoneNumberId: tenant.whatsappPhoneNumberId ?? "",
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
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
