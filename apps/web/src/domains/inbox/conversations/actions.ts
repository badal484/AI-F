"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb, type TenantDb, type Conversation, type Customer, type Lead, type Message, type User } from "@aif/db";
import {
  createConversationSchema,
  assignConversationSchema,
  updateConversationStatusSchema,
  nullifyEmptyStrings,
  type CreateConversationInput,
  type AssignConversationInput,
  type UpdateConversationStatusInput,
  type DataActionResult,
} from "@aif/shared";
import { requireTenantContext, UnauthorizedError } from "@/domains/auth/guard";

export type ConversationSummary = Conversation & {
  customer: Customer | null;
  lead: Lead | null;
  assignedTo: Pick<User, "id" | "name" | "email"> | null;
  messages: Pick<Message, "body" | "createdAt">[];
};

async function assertBelongsToTenant(tenantDb: TenantDb, model: "customer" | "lead" | "user", id: string | null | undefined) {
  if (!id) return true;
  const record = await (model === "customer"
    ? tenantDb.customer.findUnique({ where: { id } })
    : model === "lead"
      ? tenantDb.lead.findUnique({ where: { id } })
      : tenantDb.user.findUnique({ where: { id } }));
  return Boolean(record);
}

export async function listConversations(): Promise<DataActionResult<ConversationSummary[]>> {
  try {
    const context = await requireTenantContext();
    const conversations = await getTenantDb(context.tenantId).conversation.findMany({
      include: {
        customer: true,
        lead: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
      },
      orderBy: { lastMessageAt: "desc" },
    });
    return { data: conversations };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function createConversation(
  input: CreateConversationInput,
): Promise<DataActionResult<ConversationSummary>> {
  try {
    const context = await requireTenantContext();
    const parsed = createConversationSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { initialMessage, ...rest } = nullifyEmptyStrings(parsed.data);
    const tenantDb = getTenantDb(context.tenantId);

    if (!(await assertBelongsToTenant(tenantDb, "customer", rest.customerId))) {
      return { error: "Customer not found" };
    }
    if (!(await assertBelongsToTenant(tenantDb, "lead", rest.leadId))) {
      return { error: "Lead not found" };
    }

    // Conversation + its first Message are created together — a multi-table
    // write per MASTER_INSTRUCTIONS.md §4.
    const conversation = await tenantDb.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: { ...rest, tenantId: context.tenantId },
      });
      await tx.message.create({
        data: {
          tenantId: context.tenantId,
          conversationId: created.id,
          senderType: "CUSTOMER",
          body: initialMessage,
        },
      });
      return tx.conversation.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          customer: true,
          lead: true,
          assignedTo: { select: { id: true, name: true, email: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
        },
      });
    });

    revalidatePath("/dashboard/inbox");
    return { data: conversation };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function assignConversation(
  input: AssignConversationInput,
): Promise<DataActionResult<ConversationSummary>> {
  try {
    const context = await requireTenantContext();
    const parsed = assignConversationSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { id, assignedToId } = nullifyEmptyStrings(parsed.data);
    const tenantDb = getTenantDb(context.tenantId);

    if (!(await assertBelongsToTenant(tenantDb, "user", assignedToId))) {
      return { error: "Assignee not found" };
    }

    const conversation = await tenantDb.conversation.update({
      where: { id },
      data: { assignedToId },
      include: {
        customer: true,
        lead: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
      },
    });

    revalidatePath("/dashboard/inbox");
    return { data: conversation };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}

export async function updateConversationStatus(
  input: UpdateConversationStatusInput,
): Promise<DataActionResult<ConversationSummary>> {
  try {
    const context = await requireTenantContext();
    const parsed = updateConversationStatusSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const conversation = await getTenantDb(context.tenantId).conversation.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status },
      include: {
        customer: true,
        lead: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
      },
    });

    revalidatePath("/dashboard/inbox");
    return { data: conversation };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }
}
