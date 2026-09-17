import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClaimText } from "../src/components/ClaimText.tsx";
import { claim } from "./fixtures.ts";

const c = claim("c1", "The market is large", 0);

const setup = () => {
  const onRename = vi.fn();
  render(<ClaimText claim={c} onRename={onRename} />);
  return { onRename, user: userEvent.setup() };
};

const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: c.text }));
  return screen.getByRole("textbox", { name: "Claim text" });
};

describe("ClaimText", () => {
  it("reads as prose until it is clicked, then becomes a field holding the claim", async () => {
    const { user } = setup();
    const field = await openEditor(user);
    expect(field).toHaveValue(c.text);
  });

  it("commits a new text on Enter", async () => {
    const { onRename, user } = setup();
    const field = await openEditor(user);
    await user.clear(field);
    await user.type(field, "The market is small{Enter}");
    expect(onRename).toHaveBeenCalledWith("The market is small");
    // The field closes and the text comes back from props: the parent owns the claim, not this component.
    expect(screen.getByRole("button", { name: c.text })).toBeInTheDocument();
  });

  it("trims the text it commits", async () => {
    const { onRename, user } = setup();
    const field = await openEditor(user);
    await user.clear(field);
    await user.type(field, "   Padded claim   {Enter}");
    expect(onRename).toHaveBeenCalledWith("Padded claim");
  });

  it("keeps a newline on Shift+Enter instead of committing", async () => {
    const { onRename, user } = setup();
    const field = await openEditor(user);
    await user.type(field, "{Shift>}{Enter}{/Shift}");
    expect(onRename).not.toHaveBeenCalled();
    expect(field).toHaveValue(`${c.text}\n`);
  });

  it("discards the edit on Escape", async () => {
    const { onRename, user } = setup();
    const field = await openEditor(user);
    await user.clear(field);
    await user.type(field, "Discarded{Escape}");
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: c.text })).toBeInTheDocument();
  });

  it("commits on blur but ignores an unchanged or empty text", async () => {
    const { onRename, user } = setup();
    await openEditor(user);
    await user.tab();
    expect(onRename).not.toHaveBeenCalled();

    const again = await openEditor(user);
    await user.clear(again);
    await user.tab();
    expect(onRename).not.toHaveBeenCalled();
  });
});
