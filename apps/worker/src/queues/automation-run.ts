import { Worker, type Job } from "bullmq";
import type Redis from "ioredis";
import { getTenantDb, type TenantDb } from "@aif/db";
import { sendTemplateMessage, isWhatsAppConfigured, missingWhatsAppEnvVars } from "@aif/whatsapp";
import { QUEUE_NAMES, type AutomationRunJob } from "@aif/queue";
import { createLogger } from "@aif/shared";

const logger = createLogger("worker:automation-run");

interface ResolvedTarget {
  phone: string | null;
  customerId: string | null;
  leadId: string | null;
}

/**
 * The run's `entityId` is an Appointment or Lead id, depending on the
 * rule's trigger — this is the one place that resolves it back to a real
 * row and the phone number/relations an action needs, so the two action
 * executors below don't each need to know about both entity shapes.
 */
async function resolveTarget(
  db: TenantDb,
  trigger: "APPOINTMENT_CREATED" | "LEAD_CREATED" | "LEAD_STAGE_CHANGED",
  entityId: string,
): Promise<ResolvedTarget | null> {
  if (trigger === "APPOINTMENT_CREATED") {
    const appointment = await db.appointment.findUnique({ where: { id: entityId } });
    if (!appointment || appointment.status === "CANCELLED") return null;
    return { phone: appointment.customerPhone, customerId: appointment.customerId, leadId: null };
  }
  const lead = await db.lead.findUnique({ where: { id: entityId } });
  if (!lead) return null;
  return { phone: lead.phone, customerId: lead.customerId, leadId: lead.id };
}

/**
 * Sends the rule's WhatsApp template directly (not via the outbound queue
 * — that queue exists to serialize sends tied to a Message/Conversation
 * row, and automation sends don't create one; see this file's own doc
 * comment on why). No dynamic {{n}} variable substitution is supported
 * yet — bodyParams is always empty, so a template with placeholders will
 * send them un-filled. Documented as a known limitation.
 */
async function executeSendWhatsAppTemplate(
  db: TenantDb,
  tenantId: string,
  target: ResolvedTarget,
  whatsappTemplateId: string | null,
): Promise<void> {
  if (!isWhatsAppConfigured()) {
    throw new Error(`WhatsApp is NOT CONFIGURED — set ${missingWhatsAppEnvVars().join(", ")}`);
  }
  if (!target.phone) {
    throw new Error("Target has no phone number on file");
  }
  if (!whatsappTemplateId) {
    throw new Error("Rule has no WhatsApp template configured");
  }

  const [template, tenant] = await Promise.all([
    db.whatsAppTemplate.findUnique({ where: { id: whatsappTemplateId } }),
    db.tenant.findUnique({ where: { id: tenantId } }),
  ]);
  if (!template) throw new Error("Configured WhatsApp template no longer exists");
  if (!tenant?.whatsappPhoneNumberId) throw new Error("Tenant has no whatsappPhoneNumberId configured");

  await sendTemplateMessage(tenant.whatsappPhoneNumberId, target.phone, template.name, template.language, []);
}

async function executeCreateReminder(
  db: TenantDb,
  tenantId: string,
  target: ResolvedTarget,
  reminderTitle: string | null,
  dueAt: Date,
): Promise<void> {
  if (!reminderTitle) {
    throw new Error("Rule has no reminder title configured");
  }
  await db.reminder.create({
    data: {
      tenantId,
      title: reminderTitle,
      dueAt,
      relatedCustomerId: target.customerId,
      relatedLeadId: target.leadId,
    },
  });
}

/**
 * Fires one delayed AutomationRun. Re-fetches the run (and its rule) fresh
 * rather than trusting the job payload beyond tenantId/runId, since a lot
 * can change during the delay: the rule could be disabled/deleted, and —
 * the case this specifically guards against — the run could have been
 * marked CANCELLED (e.g. the appointment it was for got cancelled; see
 * cancelAutomationRunsForEntity in packages/automations). There's no
 * attempt to remove the BullMQ delayed job itself on cancellation; this
 * status check at fire time is the cancellation mechanism.
 *
 * Action failures are re-thrown (not swallowed) so BullMQ's configured
 * retries/backoff (see enqueueAutomationRun) get a chance at transient
 * errors — same as whatsapp-outbound.ts. AutomationRun.status is only
 * written to FAILED once retries are actually exhausted, via the
 * worker-level 'failed' listener below, so a mid-retry attempt doesn't
 * block a later retry by looking "already handled".
 */
export function startAutomationRunWorker(connection: Redis): Worker<AutomationRunJob> {
  const worker = new Worker<AutomationRunJob>(
    QUEUE_NAMES.automationRun,
    async (job: Job<AutomationRunJob>) => {
      const { tenantId, runId } = job.data;
      const db = getTenantDb(tenantId);

      const run = await db.automationRun.findUnique({ where: { id: runId }, include: { rule: true } });
      if (!run) {
        logger.warn({ runId }, "AutomationRun not found — skipping");
        return;
      }
      if (run.status !== "PENDING") {
        logger.info({ runId, status: run.status }, "AutomationRun no longer pending — skipping");
        return;
      }
      if (!run.rule.isEnabled) {
        await db.automationRun.update({ where: { id: run.id }, data: { status: "CANCELLED" } });
        logger.info({ runId }, "Rule was disabled before this run fired — cancelling");
        return;
      }

      const target = await resolveTarget(db, run.rule.trigger, run.entityId);
      if (!target) {
        // Not retryable — the entity itself is gone/cancelled, not a
        // transient failure — so mark FAILED directly instead of throwing.
        await db.automationRun.update({
          where: { id: run.id },
          data: { status: "FAILED", error: "Target entity no longer exists or was cancelled" },
        });
        return;
      }

      if (run.rule.actionType === "SEND_WHATSAPP_TEMPLATE") {
        await executeSendWhatsAppTemplate(db, tenantId, target, run.rule.whatsappTemplateId);
      } else {
        await executeCreateReminder(db, tenantId, target, run.rule.reminderTitle, run.scheduledFor);
      }
      await db.automationRun.update({ where: { id: run.id }, data: { status: "SENT" } });
      logger.info({ runId, actionType: run.rule.actionType }, "Automation run executed");
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      logger.warn({ runId: job.data.runId, attempt: job.attemptsMade }, "Automation run attempt failed — will retry");
      return;
    }
    const db = getTenantDb(job.data.tenantId);
    db.automationRun
      .update({ where: { id: job.data.runId }, data: { status: "FAILED", error: err.message } })
      .catch((updateErr: unknown) => logger.error({ updateErr, runId: job.data.runId }, "Failed to record AutomationRun failure"));
    logger.error({ runId: job.data.runId, err }, "Automation run failed permanently");
  });

  return worker;
}
