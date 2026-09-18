import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArgumentCard } from "../src/components/ArgumentCard.tsx";
import { argument } from "./fixtures.ts";

const a1 = argument("a1", "c1", "No prior exits", "attack");
const a2 = argument("a2", "c1", "They ran ops at Stripe", "support", "a1");
const a3 = argument("a3", "c1", "Ops is not founding", "attack", "a1");
const row = [a1, a2, a3];

const renderCard = (arg = a2, position = 1, overrides: Partial<Parameters<typeof ArgumentCard>[0]> = {}) => {
  const apply = vi.fn().mockResolvedValue(null);
  const onToggleEdit = vi.fn();
  render(
    <ArgumentCard
      argument={arg}
      position={position}
      row={row}
      isDrop={false}
      editing={false}
      onToggleEdit={onToggleEdit}
      apply={apply}
      {...overrides}
    />,
  );
  return { apply, onToggleEdit, user: userEvent.setup() };
};

describe("ArgumentCard", () => {
  it("leaves the arrow implied when the argument answers the one before it", () => {
    renderCard(a2, 1);
    expect(screen.getByText(a2.text)).toBeInTheDocument();
    expect(screen.queryByText(/↩/)).not.toBeInTheDocument();
  });

  it("names the target when the argument reaches back past the previous one", () => {
    renderCard(a3, 2);
    expect(screen.getByText("↩ 1")).toBeInTheDocument();
  });

  it("says so when an argument answers the claim itself from later in the row", () => {
    renderCard(argument("a4", "c1", "Straight at the claim", "question", null), 2);
    expect(screen.getByText("↩ claim")).toBeInTheDocument();
  });

  it("marks a dropped argument and explains why", () => {
    renderCard(a3, 2, { isDrop: true });
    expect(screen.getByRole("button", { name: /Ops is not founding/ })).toHaveAttribute("title", "Dropped: nothing answers this");
  });

  it("opens and closes the editor through its parent", async () => {
    const { onToggleEdit, user } = renderCard();
    await user.click(screen.getByRole("button", { name: /They ran ops at Stripe/ }));
    expect(onToggleEdit).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restances, re-points and removes from the open editor", async () => {
    const { apply, onToggleEdit, user } = renderCard(a2, 1, { editing: true });
    const editor = screen.getByRole("dialog", { name: "Edit argument" });
    expect(editor).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /question/ }));
    expect(apply).toHaveBeenCalledWith({ type: "ArgumentRestanced", argumentId: a2.id, stance: "question" });

    await user.selectOptions(screen.getByRole("combobox"), "");
    expect(apply).toHaveBeenCalledWith({ type: "ArrowRepointed", argumentId: a2.id, respondsTo: null });

    await user.click(screen.getByRole("button", { name: "Not an argument" }));
    expect(apply).toHaveBeenCalledWith({ type: "ArgumentRemoved", argumentId: a2.id });

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onToggleEdit).toHaveBeenCalled();
  });

  it("only offers earlier arguments as arrow targets, so a chain cannot point forward", () => {
    renderCard(a2, 1, { editing: true });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["the claim", `1. – ${a1.text}`]);
  });

  it("shows the current stance as pressed", () => {
    renderCard(a2, 1, { editing: true });
    expect(screen.getByRole("button", { name: /support/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /attack/ })).toHaveAttribute("aria-pressed", "false");
  });
});
