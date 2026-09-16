import { describe, expect, it } from "vitest";
import { parseEnvelope } from "../src/lib/api.ts";

const isString = (d: unknown): d is string => typeof d === "string";

describe("parseEnvelope", () => {
  it("unwraps a successful envelope whose data matches", () => {
    expect(parseEnvelope({ ok: true, data: "hi", error: null }, isString)).toEqual({ ok: true, value: "hi" });
  });

  it("passes the server error through on failure", () => {
    const error = { code: "REFUSED", message: "no" };
    expect(parseEnvelope({ ok: false, data: null, error }, isString)).toEqual({ ok: false, error });
  });

  it("flags a body that is not an envelope or whose data has the wrong shape", () => {
    expect(parseEnvelope("nope", isString)).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
    expect(parseEnvelope({ ok: true, data: 42, error: null }, isString)).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
  });
});
