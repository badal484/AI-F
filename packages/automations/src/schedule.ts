import { getTenantDb, type LeadStage } from "@aif/db";
import { enqueueAutomationRun, isRedisConfigured } from "@aif/queue";
import { createLogger, logNotConfigured } from "@aif/shared";

const logger = createLogger("automations:schedule");

export type AutomationTriggerEvent =
  | { trigger: "APPOINTMENT_CREATED"; tenantId: string; entityId: string; startAt: Date }
  | { trigger: "LEAD_CREATED"; tenantId: string; entityId: string }
  | { trigger: "LEAD_STAGE_CHANGED"; tenantId: string; entityId: string; toStage: LeadStage };

/**
 * Finds every enabled AutomationRule matching this trigger (and, for
 * LEAD_STAGE_CHANGED, the specific stage) and schedules one AutomationRun
 * per rule via a delayed BullMQ job. Called at the moment the triggering
 * event happens (an appointment gets booked, a lead gets created, a lead's
 * stage changes) — there is no poll/cron here, every trigger already lives
 * inside a real write path (packages/booking's bookAppointment, and
 * apps/web/domains/crm's lead actions / packages/ai's captureLead tool).
 *
 * Deliberately swallows its own errors (logged, not thrown) — scheduling a
 * reminder is a secondary effect of the write that actually matters (the
 * appointment/lead itself existing), and must never fail or roll back the
 * caller's request.
 */
export async function scheduleAutomationRuns(event: AutomationTriggerEvent): Promise<void> {
  if (!isRedisConfigured()) {
    logNotConfigured(logger, "Redis", ["REDIS_URL"]);
    return;
  }

  try {
    const db = getTenantDb(event.tenantId);
    const rules = await db.automationRule.findMany({
      where: {
        isEnabled: true,
        trigger: event.trigger,
        ...(event.trigger === "LEAD_STAGE_CHANGED" ? { triggerStage: event.toStage } : {}),
      },
    });
    if (rules.length === 0) return;

    const now = Date.now();

    for (const rule of rules) {
      const scheduledFor =
        event.trigger === "APPOINTMENT_CREATED"
          ? new Date(event.startAt.getTime() - rule.delayMinutes * 60_000)
          : new Date(now + rule.delayMinutes * 60_000);

      // A reminder whose target moment has already passed (e.g. an
      // appointment booked to start sooner than the rule's lead time)
      // makes no sense to send late — record it as SKIPPED for audit
      // visibility and don't enqueue anything. LEAD_CREATED/
      // LEAD_STAGE_CHANGED can never hit this branch since their anchor is
      // "now".
      const alreadyPassed = event.trigger === "APPOINTMENT_CREATED" && scheduledFor.getTime() <= now;

      // upsert (not create) so a rule fires at most once per entity even
      // if this function is ever invoked twice for the same event (e.g. a
      // Lead re-entering the same stage later) — `update: {}` leaves an
      // existing run untouched, matching the unique(ruleId, entityId)
      // constraint's intent. A documented tradeoff: a rule will not
      // re-fire for a repeat transition, which avoids spamming staff/
      // customers far more often than it under-delivers a reminder.
      const run = await db.automationRun.upsert({
        where: { ruleId_entityId: { ruleId: rule.id, entityId: event.entityId } },
        create: {
          tenantId: event.tenantId,
          ruleId: rule.id,
          entityId: event.entityId,
          scheduledFor,
          status: alreadyPassed ? "SKIPPED" : "PENDING",
        },
        update: {},
      });

      if (run.status !== "PENDING") continue;

      const delayMs = Math.max(0, scheduledFor.getTime() - Date.now());
      await enqueueAutomationRun({ tenantId: event.tenantId, runId: run.id }, delayMs);
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to schedule automation runs");
  }
}

/**
 * Marks every still-PENDING AutomationRun for one entity as CANCELLED —
 * e.g. an appointment reminder shouldn't fire once the appointment itself
 * is cancelled. Does not (and cannot cheaply) remove the underlying BullMQ
 * delayed job; the worker checks status = PENDING at fire time instead, so
 * this is sufficient on its own. Same error-swallowing rationale as
 * scheduleAutomationRuns().
 */
export async function cancelAutomationRunsForEntity(tenantId: string, entityId: string): Promise<void> {
  try {
    const db = getTenantDb(tenantId);
    await db.automationRun.updateMany({
      where: { entityId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  } catch (err) {
    logger.error({ err, tenantId, entityId }, "Failed to cancel automation runs");
  }
}
