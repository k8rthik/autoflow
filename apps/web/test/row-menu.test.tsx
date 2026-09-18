import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RowMenu } from "../src/components/RowMenu.tsx";
import { claim } from "./fixtures.ts";

const mine = claim("c1", "The market is large", 0);
const other = claim("c2", "The team is strong", 1);

const setup = async (claims = [mine, other]) => {
  const apply = vi.fn().mockResolvedValue(null);
  const user = userEvent.setup();
  render(<RowMenu claim={mine} claims={claims} apply={apply} />);
  await user.click(screen.getByRole("button", { name: "Row options" }));
  return { apply, user };
};

describe("RowMenu", () => {
  it("stays out of the way until it is opened", () => {
    render(<RowMenu claim={mine} claims={[mine, other]} apply={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Row options" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("merges this claim into the one chosen, and never offers itself as a target", async () => {
    const { apply, user } = await setup();
    const select = screen.getByRole("combobox");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["choose a claim…", other.text]);
    await user.selectOptions(select, other.id);
    expect(apply).toHaveBeenCalledWith({ type: "ClaimsMerged", into: other.id, from: mine.id });
  });

  it("deletes the row", async () => {
    const { apply, user } = await setup();
    await user.click(screen.getByRole("button", { name: "Delete row" }));
    expect(apply).toHaveBeenCalledWith({ type: "ClaimRemoved", claimId: mine.id });
  });

  it("offers no merge when this is the only claim", async () => {
    await setup([mine]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete row" })).toBeInTheDocument();
  });

  it("closes again", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Row options" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
