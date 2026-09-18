import { statusOfAll, type Claim } from "@autoflow/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "../src/components/Header.tsx";
import type { SessionDoc } from "../src/lib/session-doc.ts";
import { argument, argumentAdded, build, claim, claimAdded, sessionDoc } from "./fixtures.ts";

const events = [
  claimAdded(claim("c1", "The market is large", 0)),
  claimAdded(claim("c2", "The team is strong", 1)),
  claimAdded(claim("c3", "The price is fair", 2)),
  argumentAdded(argument("a1", "c2", "No prior exits", "attack")),
  argumentAdded(argument("a2", "c3", "What is the entry multiple?", "question")),
];

const setup = (doc: SessionDoc = sessionDoc(events)) => {
  const state = build(doc.events.map((e) => e.event));
  const claims: readonly Claim[] = Object.values(state.claims).toSorted((a, b) => a.order - b.order);
  const onLeave = vi.fn();
  render(<Header doc={doc} claims={claims} statuses={statusOfAll(state)} onLeave={onLeave} />);
  return { onLeave, user: userEvent.setup() };
};

describe("Header", () => {
  it("counts the claims and what still stands against them", () => {
    setup();
    expect(screen.getByText(/3 claims/)).toBeInTheDocument();
    expect(screen.getByText("1 contested")).toBeInTheDocument();
    expect(screen.getByText("1 open")).toBeInTheDocument();
  });

  it("says nothing about contested or open rows when there are none", () => {
    setup(sessionDoc([claimAdded(claim("c1", "Only claim", 0))], "Quiet"));
    expect(screen.getByText(/1 claim$/)).toBeInTheDocument();
    expect(screen.queryByText(/contested/)).not.toBeInTheDocument();
    expect(screen.queryByText(/open/)).not.toBeInTheDocument();
  });

  it("falls back to a placeholder when the memo had no title", () => {
    setup(sessionDoc(events, ""));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Untitled memo");
  });

  it("offers no undo, because the log is shared and append-only", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("asks before leaving, and says the flow is not being thrown away", async () => {
    const { onLeave, user } = setup();
    await user.click(screen.getByRole("button", { name: "New memo" }));
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByText(/The flow stays on the server/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New memo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New memo" }));
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeave).toHaveBeenCalled();
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
    expect(JSON.parse(await blob.text())).toEqual(sessionDoc(events));
    click.mockRestore();
  });
});
