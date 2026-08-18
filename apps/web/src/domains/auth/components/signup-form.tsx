"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUpSchema, type SignUpInput } from "@aif/shared";
import { signUp } from "@/domains/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function SignUpForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  async function onSubmit(values: SignUpInput) {
    setServerError(null);
    const result = await signUp(values);
    if (result && "error" in result) {
      setServerError(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="tenantName">Business name</Label>
        <Input
          id="tenantName"
          autoComplete="organization"
          {...register("tenantName", {
            onChange: (e) => {
              if (!getValues("tenantSlug")) {
                setValue("tenantSlug", slugify(e.target.value));
              }
            },
          })}
        />
        {errors.tenantName && <p className="text-sm text-destructive">{errors.tenantName.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="tenantSlug">Workspace URL</Label>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>app.aif.dev/</span>
          <Input id="tenantSlug" className="flex-1" {...register("tenantSlug")} />
        </div>
        {errors.tenantSlug && <p className="text-sm text-destructive">{errors.tenantSlug.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Creating workspace…" : "Create workspace"}
      </Button>
    </form>
  );
}
