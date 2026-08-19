"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getBillingStatus, startCheckout, openBillingPortal } from "@/domains/billing/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PaidTier } from "@aif/billing";

const PLAN_LABELS: Record<PaidTier, string> = { STARTER: "Starter", PRO: "Pro" };

function formatPrice(price: { unitAmount: number; currency: string; intervalLabel: string } | null): string {
  if (!price) return "Not configured";
  const amount = (price.unitAmount / 100).toLocaleString(undefined, {
    style: "currency",
    currency: price.currency.toUpperCase(),
  });
  return `${amount} / ${price.intervalLabel}`;
}

export function BillingDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["billing-status"],
    queryFn: async () => {
      const result = await getBillingStatus();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast.success("Subscription updated — this can take a few seconds to reflect below.");
      router.replace("/dashboard/billing");
    } else if (checkout === "canceled") {
      toast.info("Checkout canceled — no changes were made.");
      router.replace("/dashboard/billing");
    }
  }, [searchParams, router]);

  const checkoutMutation = useMutation({
    mutationFn: startCheckout,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      window.location.href = result.data.url;
    },
    onError: () => toast.error("Something went wrong"),
  });

  const portalMutation = useMutation({
    mutationFn: openBillingPortal,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      window.location.href = result.data.url;
    },
    onError: () => toast.error("Something went wrong"),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full max-w-lg" />
      </div>
    );
  }

  if (!data) return null;

  const currentTier = data.subscription?.planTier ?? "FREE";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">Your subscription and payment details.</p>
      </div>

      {!data.stripeConfigured && (
        <p className="max-w-lg rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Stripe is NOT CONFIGURED for this deployment — subscribing isn&apos;t available yet.
        </p>
      )}

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Current plan
            <Badge variant={currentTier === "FREE" ? "outline" : "default"}>{currentTier}</Badge>
            {data.subscription && <Badge variant="outline">{data.subscription.status}</Badge>}
          </CardTitle>
          {data.subscription && (
            <CardDescription>
              {data.subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
              {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}
            </CardDescription>
          )}
        </CardHeader>
        {data.subscription && (
          <CardFooter>
            <Button
              type="button"
              variant="outline"
              disabled={portalMutation.isPending}
              onClick={() => portalMutation.mutate()}
            >
              {portalMutation.isPending ? "Opening…" : "Manage billing"}
            </Button>
          </CardFooter>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {data.plans.map((plan) => (
          <Card key={plan.tier}>
            <CardHeader>
              <CardTitle>{PLAN_LABELS[plan.tier]}</CardTitle>
              <CardDescription>{formatPrice(plan.price)}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                type="button"
                disabled={
                  !data.stripeConfigured ||
                  !plan.price ||
                  currentTier === plan.tier ||
                  checkoutMutation.isPending
                }
                onClick={() => checkoutMutation.mutate({ tier: plan.tier })}
              >
                {currentTier === plan.tier
                  ? "Current plan"
                  : checkoutMutation.isPending
                    ? "Redirecting…"
                    : `Subscribe to ${PLAN_LABELS[plan.tier]}`}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => refetch()}>
        Refresh status
      </Button>
    </div>
  );
}
