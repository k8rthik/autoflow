import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFlowDoc } from "../src/lib/useFlowDoc.ts";
import { argument, argumentAdded, claim, claimAdded } from "./fixtures.ts";

const STORAGE_KEY = "autoflow.doc.v1";
const events = [claimAdded(claim("c1", "The market is large", 0, "Market"))];
const doc = { title: "Larkspur", events };

beforeEach(() => window.localStorage.clear());

describe("useFlowDoc", () => {
  it("starts empty and loads a document", () => {
    const { result } = renderHook(() => useFlowDoc());
    expect(result.current.doc.events).toEqual([]);

    act(() => result.current.actions.load(doc));
    expect(result.current.doc.title).toBe("Larkspur");
    expect(result.current.state.claims["c1"]?.text).toBe("The market is large");
  });

  it("appends a valid event and projects it", () => {
    const { result } = renderHook(() => useFlowDoc());
    act(() => result.current.actions.load(doc));

    let error: string | null = "unset";
    act(() => {
      error = result.current.actions.apply({ type: "ClaimRenamed", claimId: "c1", text: "The market is crowded" });
    });

    expect(error).toBeNull();
    expect(result.current.doc.events).toHaveLength(2);
    expect(result.current.state.claims["c1"]?.text).toBe("The market is crowded");
  });

  it("rejects an invalid event, returning the reason and leaving the log untouched", () => {
    const { result } = renderHook(() => useFlowDoc());
    act(() => result.current.actions.load(doc));

    let error: string | null = null;
    act(() => {
      error = result.current.actions.apply({ type: "ClaimRenamed", claimId: "nope", text: "x" });
    });

    expect(error).toBeTruthy();
    expect(result.current.doc.events).toHaveLength(1);
  });

  it("undoes the last event and resets to a blank flow", () => {
    const { result } = renderHook(() => useFlowDoc());
    act(() => result.current.actions.load(doc));
    act(() => void result.current.actions.apply(argumentAdded(argument("a1", "c1", "No prior exits", "attack"))));
    expect(result.current.doc.events).toHaveLength(2);

    act(() => result.current.actions.undo());
    expect(result.current.doc.events).toHaveLength(1);
    expect(result.current.state.arguments["a1"]).toBeUndefined();

    act(() => result.current.actions.reset());
    expect(result.current.doc).toEqual({ title: "", events: [] });
  });

  it("persists the document and restores it on the next mount", () => {
    const first = renderHook(() => useFlowDoc());
    act(() => first.result.current.actions.load(doc));
    first.unmount();

    const second = renderHook(() => useFlowDoc());
    expect(second.result.current.doc).toEqual(doc);
    expect(second.result.current.state.claims["c1"]).toBeDefined();
  });

  it("ignores stored data that is corrupt or whose log will not replay", () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    expect(renderHook(() => useFlowDoc()).result.current.doc.events).toEqual([]);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: "Broken", events: [{ type: "ClaimRenamed", claimId: "ghost", text: "x" }] }));
    expect(renderHook(() => useFlowDoc()).result.current.doc.events).toEqual([]);
  });

  it("keeps working when storage is unavailable", () => {
    const setItem = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      const { result } = renderHook(() => useFlowDoc());
      act(() => result.current.actions.load(doc));
      expect(result.current.state.claims["c1"]).toBeDefined();
    } finally {
      window.localStorage.setItem = setItem;
    }
  });
});
