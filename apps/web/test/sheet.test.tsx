import { statusOfAll } from "@autoflow/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "../src/components/Sheet.tsx";
import type { FlowActions } from "../src/lib/useFlowDoc.ts";
import { argument, argumentAdded, build, claim, claimAdded } from "./fixtures.ts";

const events = [
  claimAdded(claim("c1", "The market is large", 0, "Market")),
  claimAdded(claim("c2", "Growth is compounding", 1, "Market")),
  claimAdded(claim("c3", "The team is strong", 2, "Team")),
  argumentAdded(argument("a1", "c3", "No prior exits", "attack", null, "memo")),
];

const actions = (): FlowActions => ({ load: vi.fn(), apply: vi.fn().mockReturnValue(null), undo: vi.fn(), reset: vi.fn() });

const setup = (evts = events) => {
  const state = build(evts);
  const acts = actions();
  render(<Sheet doc={{ title: "Larkspur", events: evts }} state={state} actions={acts} />);
  return { acts, user: userEvent.setup() };
};

describe("Sheet", () => {
  it("groups consecutive claims under the memo's own topic heading", () => {
    setup();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Market", "Team"]);
  });

  it("numbers rows continuously down the sheet, not per topic", () => {
    setup();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByText(/^\d+$/).textContent)).toEqual(["1", "2", "3"]);
  });

  it("orders claims by their position in the memo, whatever order the events arrived in", () => {
    const shuffled = [
      claimAdded(claim("c3", "Third", 2, "Team")),
      claimAdded(claim("c1", "First", 0, "Market")),
      claimAdded(claim("c2", "Second", 1, "Market")),
    ];
    setup(shuffled);
    const texts = screen.getAllByRole("listitem").map((r) => within(r).getByTitle("Edit claim").textContent);
    expect(texts).toEqual(["First", "Second", "Third"]);
  });

  it("gives each row the status derived from its arguments", () => {
    setup();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByRole("img")).toHaveAccessibleName(/Untested/);
    expect(within(rows[2]!).getByRole("img")).toHaveAccessibleName(/Contested/);
  });

  it("agrees with the domain about every row's status", () => {
    const state = build(events);
    const statuses = statusOfAll(state);
    expect(statuses["c1"]?.status).toBe("untested");
    expect(statuses["c3"]?.status).toBe("contested");
  });

  it("shows arguments on the row they belong to", () => {
    setup();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[2]!).getByText("No prior exits")).toBeInTheDocument();
    expect(within(rows[0]!).queryByText("No prior exits")).not.toBeInTheDocument();
  });

  it("explains its own notation in the legend", () => {
    setup();
    expect(screen.getByText(/dropped, nothing answers it/)).toBeInTheDocument();
    expect(screen.getByText(/from the memo/)).toBeInTheDocument();
  });

  it("renders claims that have no topic without inventing a heading", () => {
    setup([claimAdded(claim("c1", "Untopiced claim", 0))]);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByText("Untopiced claim")).toBeInTheDocument();
  });

  it("reopens a topic that the memo returns to later rather than merging it", () => {
    setup([
      claimAdded(claim("c1", "A", 0, "Market")),
      claimAdded(claim("c2", "B", 1, "Team")),
      claimAdded(claim("c3", "C", 2, "Market")),
    ]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Market", "Team", "Market"]);
  });
});

describe("Row corrections", () => {
  it("sends a rename through to the document", async () => {
    const { acts, user } = setup();
    await user.click(screen.getByRole("button", { name: "The market is large" }));
    const field = screen.getByRole("textbox", { name: "Claim text" });
    await user.clear(field);
    await user.type(field, "The market is crowded{Enter}");
    expect(acts.apply).toHaveBeenCalledWith({ type: "ClaimRenamed", claimId: "c1", text: "The market is crowded" });
  });

  it("adds an argument to the row it was opened on", async () => {
    const { acts, user } = setup();
    await user.click(screen.getByRole("button", { name: "Add an argument to claim 1" }));
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "TAM is bottom-up");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(acts.apply).toHaveBeenCalledWith(
      expect.objectContaining({ argument: expect.objectContaining({ claimId: "c1", text: "TAM is bottom-up" }) }),
    );
  });

  it("opens one argument's editor at a time and closes it on a second click", async () => {
    const { user } = setup();
    const card = screen.getByRole("button", { name: /No prior exits/ });

    await user.click(card);
    expect(screen.getByRole("dialog", { name: "Edit argument" })).toBeInTheDocument();

    await user.click(card);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("surfaces a rejected event on the row instead of dropping it silently", async () => {
    const state = build(events);
    const acts: FlowActions = { load: vi.fn(), apply: vi.fn().mockReturnValue("Unknown claim: c1"), undo: vi.fn(), reset: vi.fn() };
    render(<Sheet doc={{ title: "Larkspur", events }} state={state} actions={acts} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Add an argument to claim 1" }));
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "Rejected");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Unknown claim: c1");
  });
});
