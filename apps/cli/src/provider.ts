import type { ClientOptions } from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ProviderName = "anthropic" | "openrouter";

export interface Provider {
  readonly name: ProviderName;
  /** Passed straight to `new Anthropic(...)`. Empty means "let the SDK resolve credentials". */
  readonly clientOptions: ClientOptions;
  readonly defaultModel: string;
}

export type ProviderResult = { readonly ok: true; readonly value: Provider } | { readonly ok: false; readonly error: string };

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";
const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5";

export const NO_CREDENTIALS_MESSAGE = `No model credentials found. Put one of these in .env (see .env.example) or your shell:
  ANTHROPIC_API_KEY=sk-ant-...     Anthropic directly
  OPENROUTER_API_KEY=sk-or-...     via OpenRouter's Anthropic-compatible endpoint
An "ant auth login" profile also works for Anthropic.`;

const isSet = (value: string | undefined): value is string => typeof value === "string" && value.trim() !== "";

const defaultProfileExists = (): boolean => existsSync(join(homedir(), ".config", "anthropic"));

/**
 * Default model is Haiku 4.5 on both routes: see docs/model-eval-2026-09-10.md for the numbers.
 * Picks where requests go. Anthropic wins when configured because it is the first-party
 * path; OpenRouter is the fallback. Both speak the Messages API, so the adapter is shared.
 */
export const resolveProvider = (
  env: Readonly<Record<string, string | undefined>>,
  hasAnthropicProfile: () => boolean = defaultProfileExists,
): ProviderResult => {
  const anthropicConfigured = isSet(env["ANTHROPIC_API_KEY"]) || isSet(env["ANTHROPIC_AUTH_TOKEN"]) || hasAnthropicProfile();
  if (anthropicConfigured) {
    return { ok: true, value: { name: "anthropic", clientOptions: {}, defaultModel: ANTHROPIC_DEFAULT_MODEL } };
  }
  const openRouterKey = env["OPENROUTER_API_KEY"];
  if (isSet(openRouterKey)) {
    return {
      ok: true,
      value: {
        name: "openrouter",
        clientOptions: { apiKey: openRouterKey, baseURL: OPENROUTER_BASE_URL },
        defaultModel: OPENROUTER_DEFAULT_MODEL,
      },
    };
  }
  return { ok: false, error: NO_CREDENTIALS_MESSAGE };
};
