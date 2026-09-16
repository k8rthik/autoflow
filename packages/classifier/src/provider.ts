import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClaudeClaimExtractor } from "./claude-claim-extractor.ts";
import type { ClaimExtractor } from "./types.ts";

export type ProviderName = "anthropic" | "openrouter";

export interface Provider {
  readonly name: ProviderName;
  /** Passed straight to `new Anthropic(...)`. Empty means "let the SDK resolve credentials". */
  readonly clientOptions: ClientOptions;
  readonly defaultModel: string;
}

export type ProviderResult = { readonly ok: true; readonly value: Provider } | { readonly ok: false; readonly error: string };

export interface ConfiguredExtractor {
  readonly provider: Provider;
  readonly model: string;
  readonly extractor: ClaimExtractor;
}

export type ConfiguredExtractorResult =
  | { readonly ok: true; readonly value: ConfiguredExtractor }
  | { readonly ok: false; readonly error: string };

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";
const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-5";
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";

export const NO_CREDENTIALS_MESSAGE = `No model credentials found. Put one of these in .env (see .env.example) or your shell:
  ANTHROPIC_API_KEY=sk-ant-...     Anthropic directly
  OPENROUTER_API_KEY=sk-or-...     via OpenRouter's Anthropic-compatible endpoint
An "ant auth login" profile also works for Anthropic.`;

const isSet = (value: string | undefined): value is string => typeof value === "string" && value.trim() !== "";

const defaultProfileExists = (): boolean => existsSync(join(homedir(), ".config", "anthropic"));

/**
 * Default model is Sonnet 5 on both routes: Haiku scores well on flat extraction but will not build the
 * claim → evidence structure. See docs/model-eval-2026-09-10.md. Override with AUTOFLOW_MODEL or --model.
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

/** Resolves credentials and builds a ready-to-use extractor. Shared by the CLI and the server. */
export const createConfiguredExtractor = (
  env: Readonly<Record<string, string | undefined>>,
  modelOverride?: string,
): ConfiguredExtractorResult => {
  const provider = resolveProvider(env);
  if (!provider.ok) return provider;
  const model = modelOverride ?? provider.value.defaultModel;
  const client = new Anthropic(provider.value.clientOptions);
  return { ok: true, value: { provider: provider.value, model, extractor: createClaudeClaimExtractor({ client, model }) } };
};
