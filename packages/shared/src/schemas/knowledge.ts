import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const searchKnowledgeSchema = z.object({
  query: z.string().min(1).max(500),
});
export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeSchema>;
