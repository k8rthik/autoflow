import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddArgument } from "../src/components/AddArgument.tsx";
import { argument, claim } from "./fixtures.ts";

const c = claim("c1", "The market is large", 0);
const attack = argument("a1", "c1", "No prior exits", "attack");
const support = argument("a2", "c1", "They ran ops at Stripe", "support");

const setup = (row = [attack], applyReturns: string | null = null) => {
  const apply = vi.fn().mockResolvedValue(applyReturns);
  const onDone = vi.fn();
  render(<AddArgument claim={c} row={row} apply={apply} onDone={onDone} />);
  return { apply, onDone, user: userEvent.setup() };
};

const pressed = (name: RegExp) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("AddArgument", () => {
  it("defaults to answering the last argument, as a response in the room would", async () => {
    const { apply, user } = setup();
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "They advised, not operated");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ArgumentAdded", argument: expect.objectContaining({ respondsTo: attack.id, claimId: c.id }) }),
    );
  });

  it("answers the claim itself when the row is empty", async () => {
    const { apply, user } = setup([]);
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "First word on this");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ argument: expect.objectContaining({ respondsTo: null }) }));
  });

  it("guesses the stance that answers the last argument", () => {
    setup([attack]);
    expect(pressed(/support/)).toBe("true");
  });

  it("guesses an attack after a supporting argument", () => {
    setup([support]);
    expect(pressed(/attack/)).toBe("true");
  });

  it("guesses an attack on an empty row", () => {
    setup([]);
    expect(pressed(/attack/)).toBe("true");
  });

  it("marks new arguments as entered by hand, with the text trimmed", async () => {
    const { apply, user } = setup();
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "   Spaced out   ");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ argument: expect.objectContaining({ text: "Spaced out", source: "manual", sourceRefs: [] }) }),
    );
  });

  it("gives every new argument its own id", async () => {
    const { apply, user } = setup();
    const field = screen.getByRole("textbox", { name: "Argument text" });
    await user.type(field, "One");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.clear(field);
    await user.type(field, "Two");
    await user.click(screen.getByRole("button", { name: "Add" }));
    const [first, second] = apply.mock.calls.map((call) => call[0].argument.id);
    expect(first).not.toBe(second);
  });

  it("will not submit an empty or blank argument", async () => {
    const { apply, user } = setup();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "   ");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("closes once the event is accepted", async () => {
    const { onDone, user } = setup();
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "Accepted");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("stays open when the server refuses the event, so the typing is not lost", async () => {
    const { onDone, user } = setup([attack], "Unknown argument: a1");
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "Rejected");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Argument text" })).toHaveValue("Rejected");
  });

  it("cancels on the button and on Escape", async () => {
    const { onDone, user } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "{Escape}");
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
