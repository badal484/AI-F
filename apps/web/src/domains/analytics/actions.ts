"use server";

import { getTenantDb } from "@aif/db";
import { LEAD_STAGES, CONVERSATION_CHANNELS, APPOINTMENT_STATUSES, type DataActionResult } from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";

export interface CountByKey {
  key: string;
  count: number;
}

export interface AiEvaluationSummary {
  totalInteractions: number;
  escalatedCount: number;
  leadCapturedCount: number;
  bookingAttemptedCount: number;
  bookedCount: number;
  failedCount: number;
  /** Average of successful (non-error) interactions only — a failed call's duration isn't a meaningful reply time. */
  avgDurationMs: number | null;
}

export interface AnalyticsSummary {
  conversationsByChannel: CountByKey[];
  leadsByStage: CountByKey[];
  appointmentsByStatus: CountByKey[];
  ai: AiEvaluationSummary;
}

/** Fills in zero counts for every known enum value, not just the ones that actually appeared in groupBy — a stage/channel/status nobody has hit yet should still show as a 0 bar, not vanish from the chart. */
function zeroFillCounts(knownKeys: readonly string[], grouped: { key: string; count: number }[]): CountByKey[] {
  const counts = new Map(grouped.map((g) => [g.key, g.count]));
  return knownKeys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

// Read-only, day-to-day tier — any authenticated role can view their own
// tenant's analytics, same as Leads/Appointments/Inbox; there's nothing
// here to configure, only to look at.
export async function getAnalyticsSummary(): Promise<DataActionResult<AnalyticsSummary>> {
  try {
    const context = await requireTenantContext();
    const db = getTenantDb(context.tenantId);

    const [conversationGroups, leadGroups, appointmentGroups, aiLogs] = await Promise.all([
      db.conversation.groupBy({ by: ["channel"], _count: { _all: true } }),
      db.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
      db.appointment.groupBy({ by: ["status"], _count: { _all: true } }),
      db.aiInteractionLog.findMany({
        select: { escalated: true, leadCaptured: true, bookingAttempted: true, booked: true, error: true, durationMs: true },
      }),
    ]);

    const totalInteractions = aiLogs.length;
    const successfulDurations = aiLogs.filter((log) => log.error === null).map((log) => log.durationMs);
    const avgDurationMs =
      successfulDurations.length > 0
        ? Math.round(successfulDurations.reduce((sum, ms) => sum + ms, 0) / successfulDurations.length)
        : null;

    return {
      data: {
        conversationsByChannel: zeroFillCounts(
          CONVERSATION_CHANNELS,
          conversationGroups.map((g) => ({ key: g.channel, count: g._count._all })),
        ),
        leadsByStage: zeroFillCounts(
          LEAD_STAGES,
          leadGroups.map((g) => ({ key: g.stage, count: g._count._all })),
        ),
        appointmentsByStatus: zeroFillCounts(
          APPOINTMENT_STATUSES,
          appointmentGroups.map((g) => ({ key: g.status, count: g._count._all })),
        ),
        ai: {
          totalInteractions,
          escalatedCount: aiLogs.filter((log) => log.escalated).length,
          leadCapturedCount: aiLogs.filter((log) => log.leadCaptured).length,
          bookingAttemptedCount: aiLogs.filter((log) => log.bookingAttempted).length,
          bookedCount: aiLogs.filter((log) => log.booked).length,
          failedCount: aiLogs.filter((log) => log.error !== null).length,
          avgDurationMs,
        },
      },
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
