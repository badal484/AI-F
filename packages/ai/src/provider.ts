import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

export function missingAiEnvVars(): string[] {
  return isAiConfigured() ? [] : ["ANTHROPIC_API_KEY (or OPENAI_API_KEY)"];
}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

/**
 * Resolves the LanguageModel to use, preferring Anthropic (this platform's
 * default provider) and falling back to OpenAI if only that key is set —
 * the "abstraction layer supporting Anthropic/OpenAI" from
 * MASTER_INSTRUCTIONS.md §3. Throws with a clear NOT CONFIGURED message
 * rather than letting a missing key surface as an opaque provider error;
 * callers should check isAiConfigured() first and degrade gracefully
 * (per MASTER_INSTRUCTIONS.md §7) instead of letting this throw reach a user.
 */
export function getModel(): LanguageModel {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(process.env.AI_MODEL ?? DEFAULT_ANTHROPIC_MODEL);
  }
  if (process.env.OPENAI_API_KEY) {
    if (!process.env.AI_MODEL) {
      throw new Error(
        "AI_MODEL must be set when using OPENAI_API_KEY — no default OpenAI model is assumed.",
      );
    }
    return openai(process.env.AI_MODEL);
  }
  throw new Error("AI is NOT CONFIGURED — set ANTHROPIC_API_KEY or OPENAI_API_KEY");
}
