import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import * as api from "../src/lib/api.ts";

vi.mock("../src/lib/api.ts", () => ({
  buildFlow: vi.fn(),
  fetchSample: vi.fn(),
  listSamples: vi.fn(),
  parseMemoFile: vi.fn(),
}));

const mocked = vi.mocked(api);
const events = [
  { type: "ClaimAdded" as const, claim: { id: "c1", text: "The market is large", order: 0, topic: "Market" } },
  { type: "ClaimAdded" as const, claim: { id: "c2", text: "The team is strong", order: 1, topic: "Team" } },
];

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  mocked.listSamples.mockResolvedValue({ ok: true, value: { samples: [] } });
  mocked.buildFlow.mockResolvedValue({ ok: true, value: { title: "Larkspur", events, model: "fake", latencyMs: 1 } });
});

describe("App", () => {
  it("starts on the intake and moves to the sheet once a flow is built", async () => {
    render(<App />);
    const user = userEvent.setup();
    expect(screen.getByRole("heading", { name: "Start with the memo." })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Investment memo" }), "a memo");
    await user.click(screen.getByRole("button", { name: "Build the flow" }));

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Larkspur"));
    expect(screen.getByText("The market is large")).toBeInTheDocument();
    expect(screen.getByText(/2 claims/)).toBeInTheDocument();
  });

  it("corrects the flow in place and keeps the correction in the log", async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Investment memo" }), "a memo");
    await user.click(screen.getByRole("button", { name: "Build the flow" }));
    await waitFor(() => expect(screen.getByText("The market is large")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add an argument to claim 1" }));
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "TAM is bottom-up");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("TAM is bottom-up")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("TAM is bottom-up")).not.toBeInTheDocument();
  });

  it("comes back to the flow it was on after a reload", async () => {
    const first = render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Investment memo" }), "a memo");
    await user.click(screen.getByRole("button", { name: "Build the flow" }));
    await waitFor(() => expect(screen.getByText("The market is large")).toBeInTheDocument());
    first.unmount();

    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Larkspur");
    expect(screen.getByText("The market is large")).toBeInTheDocument();
  });

  it("goes back to the intake when the flow is discarded", async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Investment memo" }), "a memo");
    await user.click(screen.getByRole("button", { name: "Build the flow" }));
    await waitFor(() => expect(screen.getByText("The market is large")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "New memo" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.getByRole("heading", { name: "Start with the memo." })).toBeInTheDocument();
  });
});
