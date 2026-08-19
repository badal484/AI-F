import type { SubscriptionStatus } from "@aif/db";
import type Stripe from "stripe";

/**
 * Maps Stripe's own (lowercase, snake_case) Subscription.status values to
 * our Prisma enum 1:1 — no lossy collapsing (e.g. `paused` staying
 * distinct from `active`), verified against stripe@22.5.0's own type defs.
 * Stripe's type also allows an arbitrary OtherString for forward
 * compatibility with statuses added after this SDK version; those fall
 * through to null so the caller can skip/log rather than writing a wrong
 * status.
 */
export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus | null {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    case "paused":
      return "PAUSED";
    default:
      return null;
  }
}
