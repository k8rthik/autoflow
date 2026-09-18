import type { RecordedEvent } from "@autoflow/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import * as api from "../src/lib/api.ts";
import type { LiveMessage } from "../src/lib/live.ts";
import * as live from "../src/lib/live.ts";

vi.mock("../src/lib/api.ts", () => ({
  createSession: vi.fn(),
  fetchSession: vi.fn(),
  fetchSample: vi.fn(),
  listSamples: vi.fn(),
  parseMemoFile: vi.fn(),
  submitEvents: vi.fn(),
}));

vi.mock("../src/lib/live.ts", () => ({ connectLive: vi.fn() }));

const mocked = vi.mocked(api);
const mockedLive = vi.mocked(live);

const session = { id: "s1", title: "Larkspur", createdAt: "2026-09-18T10:00:00.000Z" };
const recorded = (seq: number, event: RecordedEvent["event"]): RecordedEvent => ({
  seq,
  at: `2026-09-18T10:0${seq}:00.000Z`,
  actor: "import",
  event,
});
const seeded = [
  recorded(1, { type: "ClaimAdded", claim: { id: "c1", text: "The market is large", order: 0, topic: "Market" } }),
  recorded(2, { type: "ClaimAdded", claim: { id: "c2", text: "The team is strong", order: 1, topic: "Team" } }),
];

/** Captures the handler the room registers, so a test can push an event as the server would. */
let pushToRoom: (message: LiveMessage) => void;
const close = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "";
  mocked.listSamples.mockResolvedValue({ ok: true, value: { samples: [] } });
  mocked.createSession.mockResolvedValue({ ok: true, value: { session, events: seeded, model: "fake", latencyMs: 1 } });
  mocked.fetchSession.mockResolvedValue({ ok: true, value: { session, events: seeded } });
  mocked.submitEvents.mockResolvedValue({ ok: true, value: { events: [] } });
  mockedLive.connectLive.mockImplementation((_id, onMessage) => {
    pushToRoom = onMessage;
    return { close };
  });
});

afterEach(() => {
  window.location.hash = "";
});

const buildFromIntake = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByRole("textbox", { name: "Investment memo" }), "a memo");
  await user.click(screen.getByRole("button", { name: "Build the flow" }));
  await waitFor(() => expect(screen.getByText("The market is large")).toBeInTheDocument());
};

describe("App", () => {
  it("starts on the intake and moves into the room once a session is opened", async () => {
    render(<App />);
    const user = userEvent.setup();
    expect(screen.getByRole("heading", { name: "Start with the memo." })).toBeInTheDocument();

    await buildFromIntake(user);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Larkspur");
    expect(screen.getByText(/2 claims/)).toBeInTheDocument();
  });

  it("puts the room in the URL so the link can be shared", async () => {
    render(<App />);
    await buildFromIntake(userEvent.setup());
    expect(window.location.hash).toBe("#/s/s1");
  });

  it("joins the room named in the URL instead of showing the intake", async () => {
    window.location.hash = "#/s/s1";
    render(<App />);

    await waitFor(() => expect(screen.getByText("The market is large")).toBeInTheDocument());
    expect(mocked.fetchSession).toHaveBeenCalledWith("s1");
    expect(screen.queryByRole("heading", { name: "Start with the memo." })).not.toBeInTheDocument();
  });

  it("says so when the room in the URL is gone, and offers a way out", async () => {
    window.location.hash = "#/s/ghost";
    mocked.fetchSession.mockResolvedValue({ ok: false, error: { code: "SESSION_NOT_FOUND", message: "No session ghost" } });
    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "That room is not here." })).toBeInTheDocument());
    expect(screen.getByText("No session ghost")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Start a new one" }));
    expect(screen.getByRole("heading", { name: "Start with the memo." })).toBeInTheDocument();
  });

  it("sends a correction to the server and shows it once committed", async () => {
    const committed = recorded(3, { type: "ClaimRenamed", claimId: "c1", text: "The market is crowded" });
    mocked.submitEvents.mockResolvedValue({ ok: true, value: { events: [committed] } });

    render(<App />);
    const user = userEvent.setup();
    await buildFromIntake(user);

    await user.click(screen.getByRole("button", { name: "The market is large" }));
    const field = screen.getByRole("textbox", { name: "Claim text" });
    await user.clear(field);
    await user.type(field, "The market is crowded{Enter}");

    await waitFor(() => expect(screen.getByText("The market is crowded")).toBeInTheDocument());
    expect(mocked.submitEvents).toHaveBeenCalledWith("s1", [{ type: "ClaimRenamed", claimId: "c1", text: "The market is crowded" }]);
  });

  it("shows a correction someone else made, pushed over the live connection", async () => {
    render(<App />);
    await buildFromIntake(userEvent.setup());
    expect(mockedLive.connectLive).toHaveBeenCalledWith("s1", expect.any(Function));

    pushToRoom({
      type: "events",
      events: [recorded(3, { type: "ClaimRenamed", claimId: "c2", text: "The team is unproven" })],
    });

    await waitFor(() => expect(screen.getByText("The team is unproven")).toBeInTheDocument());
  });

  it("does not show a correction the server refused", async () => {
    mocked.submitEvents.mockResolvedValue({ ok: false, error: { code: "CLAIM_NOT_FOUND", message: "No claim c1" } });
    render(<App />);
    const user = userEvent.setup();
    await buildFromIntake(user);

    await user.click(screen.getByRole("button", { name: "Add an argument to claim 1" }));
    await user.type(screen.getByRole("textbox", { name: "Argument text" }), "Rejected");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No claim c1"));
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
  });

  it("leaves the room without discarding it, and closes the live connection", async () => {
    render(<App />);
    const user = userEvent.setup();
    await buildFromIntake(user);

    await user.click(screen.getByRole("button", { name: "New memo" }));
    await user.click(screen.getByRole("button", { name: "Leave" }));

    expect(screen.getByRole("heading", { name: "Start with the memo." })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(close).toHaveBeenCalled();
  });
});
