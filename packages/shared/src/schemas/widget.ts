import { z } from "zod";

// visitorId is client-generated (crypto.randomUUID() in apps/web/public/widget.js)
// and persisted in the visitor's own browser localStorage — validated as a
// UUID shape but never trusted as an identity credential; it's a
// conversation-correlation key, not authentication.
export const widgetMessageSchema = z.object({
  visitorId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});
export type WidgetMessageInput = z.infer<typeof widgetMessageSchema>;
