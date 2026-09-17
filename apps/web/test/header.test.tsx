import { statusOfAll, type Claim } from "@autoflow/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "../src/components/Header.tsx";
import type { FlowDoc } from "../src/lib/store.ts";
import type { FlowActions } from "../src/lib/useFlowDoc.ts";
import { argument, argumentAdded, build, claim, claimAdded } from "./fixtures.ts";

const events = [
  claimAdded(claim("c1", "The market is large", 0)),
  claimAdded(claim("c2", "The team is strong", 1)),
  claimAdded(claim("c3", "The price is fair", 2)),
  argumentAdded(argument("a1", "c2", "No prior exits", "attack")),
  argumentAdded(argument("a2", "c3", "What is the entry multiple?", "question")),
];

const setup = (doc: FlowDoc = { title: "Larkspur", events }) => {
  const state = build(doc.events);
  const claims: readonly Claim[] = Object.values(state.claims).toSorted((a, b) => a.order - b.order);
  const actions: FlowActions = { load: vi.fn(), apply: vi.fn(), undo: vi.fn(), reset: vi.fn() };
  render(<Header doc={doc} claims={claims} statuses={statusOfAll(state)} actions={actions} />);
  return { actions, user: userEvent.setup() };
};

describe("Header", () => {
  it("counts the claims and what still stands against them", () => {
    setup();
    expect(screen.getByText(/3 claims/)).toBeInTheDocument();
    expect(screen.getByText("1 contested")).toBeInTheDocument();
    expect(screen.getByText("1 open")).toBeInTheDocument();
  });

  it("says nothing about contested or open rows when there are none", () => {
    setup({ title: "Quiet", events: [claimAdded(claim("c1", "Only claim", 0))] });
    expect(screen.getByText(/1 claim$/)).toBeInTheDocument();
    expect(screen.queryByText(/contested/)).not.toBeInTheDocument();
    expect(screen.queryByText(/open/)).not.toBeInTheDocument();
  });

  it("falls back to a placeholder when the memo had no title", () => {
    setup({ title: "", events });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Untitled memo");
  });

  it("undoes the last event, and offers nothing to undo on an empty log", async () => {
    const { actions, user } = setup();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(actions.undo).toHaveBeenCalled();

    setup({ title: "Empty", events: [] });
    expect(screen.getAllByRole("button", { name: "Undo" }).at(-1)).toBeDisabled();
  });

  it("asks before discarding the flow, and discards only on confirmation", async () => {
    const { actions, user } = setup();
    await user.click(screen.getByRole("button", { name: "New memo" }));
    expect(actions.reset).not.toHaveBeenCalled();
    expect(screen.getByText("Discard this flow?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(actions.reset).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New memo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New memo" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(actions.reset).toHaveBeenCalled();
  });
});

describe("Header export", () => {
  const createObjectURL = vi.fn().mockReturnValue("blob:flow");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  it("downloads the event log as the durable artifact, and releases the blob", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:flow");
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text())).toEqual({ title: "Larkspur", events });
    click.mockRestore();
  });
});
