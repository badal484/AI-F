"use server";

import { redirect } from "next/navigation";
import { getPlatformDb } from "@aif/db";
import { signInSchema, signUpSchema, type ActionResult, type SignInInput, type SignUpInput } from "@aif/shared";
import { createClient } from "@/lib/supabase/server";
import { isDatabaseConfigured, isSupabaseConfigured } from "@/lib/env";

/**
 * Signup optionally links the new Tenant to a reseller Agency (Phase 18)
 * via `agencyId`, which the signup page reads from a `?agency=<id>` query
 * param on the URL an Agency shares with its own prospective clients —
 * never a code a customer types in (a raw id isn't guessable, and this
 * avoids needing any human-facing "enter your agency code" step). An
 * unrecognized/stale id is silently ignored (signup still succeeds, just
 * without an Agency association) rather than blocking the whole signup —
 * a bad link shouldn't lock a real customer out.
 */
export async function signUp(input: SignUpInput): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Authentication is NOT CONFIGURED — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }
  if (!isDatabaseConfigured()) {
    return { error: "Database is NOT CONFIGURED — set DATABASE_URL." };
  }

  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, password, tenantName, tenantSlug, agencyId } = parsed.data;

  const existingTenant = await getPlatformDb().tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });
  if (existingTenant) {
    return { error: "That workspace URL is already taken. Choose a different one." };
  }

  let resolvedAgencyId: string | undefined;
  if (agencyId) {
    const agency = await getPlatformDb().agency.findUnique({ where: { id: agencyId }, select: { id: true } });
    resolvedAgencyId = agency?.id;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    return { error: error?.message ?? "Could not create account" };
  }

  try {
    // Multi-table write (Tenant + User) wrapped in a transaction per
    // MASTER_INSTRUCTIONS.md §4. Tenant provisioning is a platform-level
    // operation — there is no tenant yet to scope a getTenantDb() call
    // with — so it deliberately uses getPlatformDb(), not getTenantDb().
    await getPlatformDb().$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: tenantName, slug: tenantSlug, agencyId: resolvedAgencyId },
      });
      await tx.user.create({
        data: {
          tenantId: tenant.id,
          supabaseUserId: data.user!.id,
          email,
          role: "OWNER",
        },
      });
    });
  } catch {
    return { error: "Account created but workspace setup failed. Contact support." };
  }

  redirect("/dashboard");
}

export async function signIn(input: SignInInput): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Authentication is NOT CONFIGURED — set Supabase env vars." };
  }

  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
