import { z } from "zod";

export const createWhatsAppTemplateSchema = z.object({
  name: z.string().min(1).max(150),
  language: z.string().min(2).max(10).default("en_US"),
  bodyText: z.string().min(1).max(2000),
});
export type CreateWhatsAppTemplateInput = z.infer<typeof createWhatsAppTemplateSchema>;

export const sendWhatsAppTemplateSchema = z.object({
  conversationId: z.string().min(1),
  templateId: z.string().min(1),
  params: z.array(z.string()).default([]),
});
export type SendWhatsAppTemplateInput = z.infer<typeof sendWhatsAppTemplateSchema>;
