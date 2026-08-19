import { getStripeClient, isStripeConfigured } from "./client";

export const PLAN_TIERS = ["FREE", "STARTER", "PRO"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PAID_TIERS = ["STARTER", "PRO"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

const PRICE_ENV_VARS: Record<PaidTier, string> = {
  STARTER: "STRIPE_PRICE_STARTER",
  PRO: "STRIPE_PRICE_PRO",
};

export function getPriceIdForTier(tier: PaidTier): string | undefined {
  return process.env[PRICE_ENV_VARS[tier]];
}

/**
 * Maps a Stripe Price id back to our PlanTier — used by the webhook
 * handler to figure out which tier a subscription is actually on. Returns
 * null (not a guess) for a price id that doesn't match either configured
 * tier, so the caller can skip/log rather than silently mis-tagging a
 * subscription.
 */
export function getPlanTierForPriceId(priceId: string): PaidTier | null {
  for (const tier of PAID_TIERS) {
    if (getPriceIdForTier(tier) === priceId) return tier;
  }
  return null;
}

export interface PlanPricing {
  tier: PaidTier;
  /** null if this tier's price env var isn't set, or Stripe isn't configured — never a guessed/hardcoded amount (MASTER_INSTRUCTIONS.md §7). */
  price: { unitAmount: number; currency: string; intervalLabel: string } | null;
}

/**
 * Fetches each paid tier's *real* price from Stripe rather than hardcoding
 * a dollar figure in this codebase — a hardcoded price could drift from
 * whatever's actually configured in the Stripe Dashboard and would be
 * exactly the kind of fabricated fact MASTER_INSTRUCTIONS.md §7 forbids.
 * Not cached — Server Components already dedupe/cache at the request
 * level, and pricing changes should show up promptly, not after some TTL.
 */
export async function listPlanPricing(): Promise<PlanPricing[]> {
  if (!isStripeConfigured()) {
    return PAID_TIERS.map((tier) => ({ tier, price: null }));
  }
  const stripe = getStripeClient();

  return Promise.all(
    PAID_TIERS.map(async (tier): Promise<PlanPricing> => {
      const priceId = getPriceIdForTier(tier);
      if (!priceId) return { tier, price: null };
      try {
        const price = await stripe.prices.retrieve(priceId);
        if (price.unit_amount === null) return { tier, price: null };
        return {
          tier,
          price: {
            unitAmount: price.unit_amount,
            currency: price.currency,
            intervalLabel: price.recurring?.interval ?? "one-time",
          },
        };
      } catch {
        // A misconfigured price id (typo, wrong mode/live-vs-test key) —
        // degrade to "not available" rather than failing the whole page.
        return { tier, price: null };
      }
    }),
  );
}
