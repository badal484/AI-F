"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type WhatsAppTemplate } from "@aif/db";
import { sendTemplateMessage, renderTemplateBody, isWhatsAppConfigured, missingWhatsAppEnvVars } from "@aif/whatsapp";
import {
  createWhatsAppTemplateSchema,
  sendWhatsAppTemplateSchema,
  deleteByIdSchema,
  type CreateWhatsAppTemplateInput,
  type SendWhatsAppTemplateInput,
  type DeleteByIdInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, requireWriteAccess, UnauthorizedError } from "@/domains/auth/guard";
import type { MessageWithSender } from "@/domains/inbox/messages/actions";

export async function listWhatsAppTemplates(): Promise<DataActionResult<WhatsAppTemplate[]>> {
  try {
    const context = await requireTenantContext();
    const templates = await getTenantDb(context.tenantId).whatsAppTemplate.findMany({
      orderBy: { name: "asc" },
    });
    return { data: templates };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

// Templates require Meta pre-approval, and what staff enter here must
// match exactly what was approved — a business-configuration action
// (requireWriteAccess), same tier as Services/Locations, not day-to-day.
export async function createWhatsAppTemplate(
  input: CreateWhatsAppTemplateInput,
): Promise<DataActionResult<WhatsAppTemplate>> {
  try {
    const context = await requireWriteAccess();
    const parsed = createWhatsAppTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const existing = await getTenantDb(context.tenantId).whatsAppTemplate.findUnique({
      where: { tenantId_name: { tenantId: context.tenantId, name: parsed.data.name } },
    });
    if (existing) {
      return { error: "A template with that name already exists" };
    }

    const template = await getTenantDb(context.tenantId).whatsAppTemplate.create({
      data: { ...parsed.data, tenantId: context.tenantId },
    });

    revalidatePath("/dashboard/whatsapp-templates");
    return { data: template };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function deleteWhatsAppTemplate(input: DeleteByIdInput): Promise<DataActionResult<{ id: string }>> {
  try {
    const context = await requireWriteAccess();
    const parsed = deleteByIdSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await getTenantDb(context.tenantId).whatsAppTemplate.delete({ where: { id: parsed.data.id } });

    revalidatePath("/dashboard/whatsapp-templates");
    return { data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

/**
 * Sends a pre-approved template message — needed outside Meta's 24-hour
 * customer-service window, when a free-form sendMessage would be
 * rejected. Called directly here rather than via the outbound queue
 * (packages/queue) — deliberately: this is a low-frequency, explicit
 * staff action, not an automated reaction, so the "one place calls the
 * API" principle for the queue doesn't need to stretch to cover it. Day-
 * to-day work (requireTenantContext), same tier as sending any other
 * inbox message.
 */
export async function sendWhatsAppTemplateToConversation(
  input: SendWhatsAppTemplateInput,
): Promise<DataActionResult<MessageWithSender>> {
  try {
    const context = await requireTenantContext();
    const parsed = sendWhatsAppTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { conversationId, templateId, params } = parsed.data;
    const tenantDb = getTenantDb(context.tenantId);

    const [template, conversation, tenant] = await Promise.all([
      tenantDb.whatsAppTemplate.findUnique({ where: { id: templateId } }),
      tenantDb.conversation.findUnique({
        where: { id: conversationId },
        include: { customer: { select: { phone: true } } },
      }),
      tenantDb.tenant.findUnique({ where: { id: context.tenantId } }),
    ]);

    if (!template) return { error: "Template not found" };
    if (!conversation) return { error: "Conversation not found" };
    if (!conversation.customer?.phone) return { error: "This conversation has no phone number on file" };
    if (!tenant?.whatsappPhoneNumberId) {
      return { error: "This business has no WhatsApp number configured (see Settings)" };
    }
    if (!isWhatsAppConfigured()) {
      return { error: `WhatsApp is NOT CONFIGURED — set ${missingWhatsAppEnvVars().join(", ")}` };
    }

    await sendTemplateMessage(
      tenant.whatsappPhoneNumberId,
      conversation.customer.phone,
      template.name,
      template.language,
      params,
    );

    const renderedBody = renderTemplateBody(template.bodyText, params);

    const message = await tenantDb.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          tenantId: context.tenantId,
          conversationId,
          senderType: "STAFF",
          senderId: context.userId,
          body: renderedBody,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      return tx.message.findUniqueOrThrow({
        where: { id: created.id },
        include: { sender: { select: { id: true, name: true, email: true } } },
      });
    });

    revalidatePath("/dashboard/inbox");
    return { data: message };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
