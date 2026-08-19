"use client";

import { useQuery } from "@tanstack/react-query";
import { getAnalyticsSummary, type CountByKey } from "@/domains/analytics/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function BarBreakdown({ title, description, rows }: { title: string; description: string; rows: CountByKey[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{row.key}</span>
              <span className="text-muted-foreground">{row.count}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AnalyticsDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => {
      const result = await getAnalyticsSummary();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Business activity and how your AI assistant is performing.</p>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {data && (
        <>
          <div>
            <h2 className="mb-3 text-lg font-medium">AI evaluation</h2>
            {data.ai.totalInteractions === 0 ? (
              <p className="text-sm text-muted-foreground">
                No AI replies have been drafted yet — this fills in once your AI assistant is configured and used
                (Inbox, WhatsApp, or the website widget).
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Total AI replies" value={String(data.ai.totalInteractions)} />
                <StatCard
                  label="Escalated to a human"
                  value={formatPercent(data.ai.escalatedCount, data.ai.totalInteractions)}
                  hint={`${data.ai.escalatedCount} of ${data.ai.totalInteractions}`}
                />
                <StatCard
                  label="Leads captured"
                  value={formatPercent(data.ai.leadCapturedCount, data.ai.totalInteractions)}
                  hint={`${data.ai.leadCapturedCount} of ${data.ai.totalInteractions}`}
                />
                <StatCard
                  label="Booking success rate"
                  value={formatPercent(data.ai.bookedCount, data.ai.bookingAttemptedCount)}
                  hint={
                    data.ai.bookingAttemptedCount === 0
                      ? "No booking attempts yet"
                      : `${data.ai.bookedCount} of ${data.ai.bookingAttemptedCount} attempts`
                  }
                />
                <StatCard
                  label="Failure rate"
                  value={formatPercent(data.ai.failedCount, data.ai.totalInteractions)}
                  hint={`${data.ai.failedCount} of ${data.ai.totalInteractions} calls errored`}
                />
                <StatCard
                  label="Avg. response time"
                  value={data.ai.avgDurationMs !== null ? `${(data.ai.avgDurationMs / 1000).toFixed(1)}s` : "—"}
                />
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <BarBreakdown
              title="Conversations"
              description="By channel"
              rows={data.conversationsByChannel.map((c) => ({ key: c.key, count: c.count }))}
            />
            <BarBreakdown
              title="Leads"
              description="By pipeline stage"
              rows={data.leadsByStage.map((l) => ({ key: l.key, count: l.count }))}
            />
            <BarBreakdown
              title="Appointments"
              description="By status"
              rows={data.appointmentsByStatus.map((a) => ({ key: a.key, count: a.count }))}
            />
            <BarBreakdown
              title="Customer sentiment"
              description="Analyzed messages only (Phase 16)"
              rows={data.customerSentiment.map((s) => ({ key: s.key, count: s.count }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
