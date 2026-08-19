import { z } from "zod";

// FREE isn't a Stripe checkout target — it's just the absence of a
// Subscription row — so only the two paid tiers are valid input here.
export const startCheckoutSchema = z.object({ tier: z.enum(["STARTER", "PRO"]) });
export type StartCheckoutInput = z.infer<typeof startCheckoutSchema>;
