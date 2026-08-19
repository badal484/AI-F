"use server";

import { headers } from "next/headers";
import { getTenantDb, type Subscription } from "@aif/db";
import {
  isStripeConfigured,
  missingStripeEnvVars,
  getOrCreateStripeCustomer,
  createCheckoutSession,
  createPortalSession,
  listPlanPricing,
  getPriceIdForTier,
  type PlanPricing,
} from "@aif/billing";
import { startCheckoutSchema, type StartCheckoutInput, type DataActionResult } from "@aif/shared";
import { requireWriteAccess, UnauthorizedError } from "@/domains/auth/guard";

export interface BillingStatus {
  stripeConfigured: boolean;
  subscription: Subscription | null;
  plans: PlanPricing[];
}

async function appOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

// Billing is a business-configuration action, same tier as
// Settings/WhatsApp templates/Automation rules — not day-to-day work.
export async function getBillingStatus(): Promise<DataActionResult<BillingStatus>> {
  try {
    const context = await requireWriteAccess();
    const subscription = await getTenantDb(context.tenantId).subscription.findUnique({
      where: { tenantId: context.tenantId },
    });
    const plans = await listPlanPricing();
    return { data: { stripeConfigured: isStripeConfigured(), subscription, plans } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function startCheckout(input: StartCheckoutInput): Promise<DataActionResult<{ url: string }>> {
  try {
    const context = await requireWriteAccess();
    const parsed = startCheckoutSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    if (!isStripeConfigured()) {
      return { error: `Stripe is NOT CONFIGURED — set ${missingStripeEnvVars().join(", ")}` };
    }
    const priceId = getPriceIdForTier(parsed.data.tier);
    if (!priceId) {
      return { error: `No Stripe price configured for the ${parsed.data.tier} plan` };
    }

    const tenantDb = getTenantDb(context.tenantId);
    const tenant = await tenantDb.tenant.findUnique({ where: { id: context.tenantId } });
    if (!tenant) {
      return { error: "Workspace not found" };
    }

    // Created/saved here, before redirecting to Checkout — not deferred
    // to the webhook. See Tenant.stripeCustomerId's doc comment in
    // schema.prisma for why that ordering matters.
    const customerId = await getOrCreateStripeCustomer({
      existingCustomerId: tenant.stripeCustomerId,
      tenantId: context.tenantId,
      email: context.userEmail,
      name: tenant.name,
    });
    if (customerId !== tenant.stripeCustomerId) {
      await tenantDb.tenant.update({ where: { id: context.tenantId }, data: { stripeCustomerId: customerId } });
    }

    const origin = await appOrigin();
    const { url } = await createCheckoutSession({
      tenantId: context.tenantId,
      customerId,
      priceId,
      successUrl: `${origin}/dashboard/billing?checkout=success`,
      cancelUrl: `${origin}/dashboard/billing?checkout=canceled`,
    });

    return { data: { url } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function openBillingPortal(): Promise<DataActionResult<{ url: string }>> {
  try {
    const context = await requireWriteAccess();
    if (!isStripeConfigured()) {
      return { error: `Stripe is NOT CONFIGURED — set ${missingStripeEnvVars().join(", ")}` };
    }

    const tenant = await getTenantDb(context.tenantId).tenant.findUnique({ where: { id: context.tenantId } });
    if (!tenant?.stripeCustomerId) {
      return { error: "No billing account yet — subscribe to a plan first" };
    }

    const origin = await appOrigin();
    const { url } = await createPortalSession({
      customerId: tenant.stripeCustomerId,
      returnUrl: `${origin}/dashboard/billing`,
    });
    return { data: { url } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
