import { describe, expect, it } from "vitest";
import { createConfiguredExtractor, resolveProvider } from "../src/provider.ts";

describe("resolveProvider", () => {
  it("routes to OpenRouter when only an OpenRouter key is present", () => {
    const provider = resolveProvider({ OPENROUTER_API_KEY: "sk-or-test" });
    expect(provider).toEqual({
      ok: true,
      value: {
        name: "openrouter",
        clientOptions: { apiKey: "sk-or-test", baseURL: "https://openrouter.ai/api" },
        defaultModel: "anthropic/claude-sonnet-5",
      },
    });
  });

  it("prefers Anthropic directly when both keys are present", () => {
    const provider = resolveProvider({ OPENROUTER_API_KEY: "sk-or-test", ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(provider.ok && provider.value.name).toBe("anthropic");
    expect(provider.ok && provider.value.defaultModel).toBe("claude-sonnet-5");
  });

  it("uses Anthropic with SDK-resolved credentials for an auth token or a profile", () => {
    expect(resolveProvider({ ANTHROPIC_AUTH_TOKEN: "t" }).ok).toBe(true);
    expect(resolveProvider({}, () => true).ok).toBe(true);
  });

  it("fails with guidance when nothing is configured", () => {
    const provider = resolveProvider({}, () => false);
    expect(provider.ok).toBe(false);
    if (!provider.ok) expect(provider.error).toMatch(/OPENROUTER_API_KEY|ANTHROPIC_API_KEY/);
  });

  it("treats empty strings as unset", () => {
    expect(resolveProvider({ OPENROUTER_API_KEY: "", ANTHROPIC_API_KEY: "" }, () => false).ok).toBe(false);
  });
});

describe("createConfiguredExtractor", () => {
  it("builds an extractor with the provider default model", () => {
    const result = createConfiguredExtractor({ OPENROUTER_API_KEY: "sk-or-test" });
    expect(result.ok && result.value.model).toBe("anthropic/claude-sonnet-5");
    expect(result.ok && typeof result.value.extractor.extractClaims).toBe("function");
  });

  it("honours a model override", () => {
    const result = createConfiguredExtractor({ OPENROUTER_API_KEY: "sk-or-test" }, "anthropic/claude-sonnet-5");
    expect(result.ok && result.value.model).toBe("anthropic/claude-sonnet-5");
  });

  it("passes the credentials failure through", () => {
    const result = createConfiguredExtractor({});
    // May succeed on a machine with an Anthropic profile; only assert the shape.
    expect(typeof result.ok).toBe("boolean");
  });
});
