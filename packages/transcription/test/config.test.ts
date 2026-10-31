import { describe, expect, it } from "vitest";
import { createConfiguredTranscriber, NO_DEEPGRAM_KEY_MESSAGE } from "../src/config.ts";

describe("createConfiguredTranscriber", () => {
  it("builds a transcriber when DEEPGRAM_API_KEY is set", () => {
    const configured = createConfiguredTranscriber({ DEEPGRAM_API_KEY: "dg-test-key" });
    expect(configured.ok && typeof configured.value.open).toBe("function");
  });

  it("says how to turn transcription on when the key is missing or blank", () => {
    expect(createConfiguredTranscriber({})).toEqual({ ok: false, error: NO_DEEPGRAM_KEY_MESSAGE });
    expect(createConfiguredTranscriber({ DEEPGRAM_API_KEY: "  " })).toEqual({ ok: false, error: NO_DEEPGRAM_KEY_MESSAGE });
    expect(NO_DEEPGRAM_KEY_MESSAGE).toMatch(/DEEPGRAM_API_KEY/);
  });
});
