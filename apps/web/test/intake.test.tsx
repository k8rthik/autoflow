import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Intake } from "../src/components/Intake.tsx";
import * as api from "../src/lib/api.ts";

vi.mock("../src/lib/api.ts", () => ({
  createSession: vi.fn(),
  fetchSample: vi.fn(),
  listSamples: vi.fn(),
  parseMemoFile: vi.fn(),
}));

const mocked = vi.mocked(api);
const session = { id: "s1", title: "Larkspur", createdAt: "2026-09-18T10:00:00.000Z" };
const events = [
  {
    seq: 1,
    at: "2026-09-18T10:00:00.000Z",
    actor: "import" as const,
    event: { type: "ClaimAdded" as const, claim: { id: "c1", text: "The market is large", order: 0 } },
  },
];

const setup = () => {
  const onCreated = vi.fn();
  const { container } = render(<Intake onCreated={onCreated} />);
  return { onCreated, container, user: userEvent.setup() };
};

const memoField = () => screen.getByRole("textbox", { name: "Investment memo" });

/** The file input is hidden and opened by the "Choose a file" button, so a real pick arrives as a change event. */
const choose = (container: HTMLElement, file: File) => {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("No file input on the intake");
  fireEvent.change(input, { target: { files: [file] } });
};

const dropOn = (container: HTMLElement, file: File) => {
  const zone = container.querySelector(".intake-drop");
  if (!zone) throw new Error("No drop zone on the intake");
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listSamples.mockResolvedValue({ ok: true, value: { samples: [{ id: "larkspur", title: "Larkspur" }] } });
  mocked.createSession.mockResolvedValue({ ok: true, value: { session, events, model: "fake", latencyMs: 1 } });
});

describe("Intake", () => {
  it("opens a session from a pasted memo and hands it up", async () => {
    const { onCreated, user } = setup();
    await user.type(memoField(), "# Larkspur\n\nThe market is large.");
    await user.click(screen.getByRole("button", { name: "Build the flow" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ session, events }));
    expect(mocked.createSession).toHaveBeenCalledWith("# Larkspur\n\nThe market is large.", []);
  });

  it("refuses to build from nothing, without calling the server", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Build the flow" }));
    expect(screen.getByRole("status")).toHaveTextContent("Paste a memo or choose a file first.");
    expect(mocked.createSession).not.toHaveBeenCalled();
  });

  it("shows the server's error rather than a blank screen", async () => {
    mocked.createSession.mockResolvedValue({ ok: false, error: { code: "NETWORK", message: "Could not reach the server. Is it running?" } });
    const { onCreated, user } = setup();
    await user.type(memoField(), "a memo");
    await user.click(screen.getByRole("button", { name: "Build the flow" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not reach the server"));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("offers the samples the server lists and loads one into the field", async () => {
    mocked.fetchSample.mockResolvedValue({ ok: true, value: { id: "larkspur", title: "Larkspur", text: "# Larkspur\n\nbody" } });
    const { user } = setup();
    const sample = await screen.findByRole("button", { name: "larkspur" });
    await user.click(sample);
    await waitFor(() => expect(memoField()).toHaveValue("# Larkspur\n\nbody"));
  });

  it("reports a sample that will not load", async () => {
    mocked.fetchSample.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "No such sample" } });
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "larkspur" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No such sample"));
  });

  it("offers no sample buttons when the server lists none", async () => {
    mocked.listSamples.mockResolvedValue({ ok: true, value: { samples: [] } });
    setup();
    await waitFor(() => expect(screen.queryByText(/try a sample/)).not.toBeInTheDocument());
  });

  it("converts a chosen file server-side and says where the text came from", async () => {
    mocked.parseMemoFile.mockResolvedValue({
      ok: true,
      value: { title: "Quill", markdown: "# Quill\n\nRenters build credit.", figures: [{ index: 1, mediaType: "image/png", data: "QUJD" }] },
    });
    const { container } = setup();
    const file = new File(["binary"], "quill.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

    choose(container, file);

    await waitFor(() => expect(memoField()).toHaveValue("# Quill\n\nRenters build credit."));
    expect(screen.getByText(/From quill.docx/)).toBeInTheDocument();
    expect(screen.getByText(/1 figure will be read with the text/)).toBeInTheDocument();
  });

  it("sends the figures from a converted file along with the text", async () => {
    const figures = [{ index: 1, mediaType: "image/png" as const, data: "QUJD" }];
    mocked.parseMemoFile.mockResolvedValue({ ok: true, value: { title: "Quill", markdown: "text", figures } });
    const { container, user } = setup();

    choose(container, new File(["x"], "quill.docx"));
    await waitFor(() => expect(memoField()).toHaveValue("text"));
    await user.click(screen.getByRole("button", { name: "Build the flow" }));

    expect(mocked.createSession).toHaveBeenCalledWith("text", figures);
  });

  it("reports a file it cannot convert", async () => {
    mocked.parseMemoFile.mockResolvedValue({ ok: false, error: { code: "UNSUPPORTED", message: "Unsupported file type" } });
    const { container } = setup();
    choose(container, new File(["x"], "deck.pdf"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Unsupported file type"));
  });

  it("highlights the drop zone while a file is over it", () => {
    const { container } = setup();
    const zone = container.querySelector(".intake-drop");
    if (!zone) throw new Error("No drop zone on the intake");

    fireEvent.dragOver(zone);
    expect(zone).toHaveClass("is-dragging");

    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveClass("is-dragging");
  });

  it("opens the file picker from the button, since the input itself is hidden", async () => {
    const { container, user } = setup();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("No file input on the intake");
    const click = vi.spyOn(input, "click").mockImplementation(() => undefined);

    await user.click(screen.getByRole("button", { name: "Choose a file" }));

    expect(click).toHaveBeenCalled();
  });

  it("takes a memo dropped onto the sheet", async () => {
    mocked.parseMemoFile.mockResolvedValue({ ok: true, value: { title: "Quill", markdown: "dropped text", figures: [] } });
    const { container } = setup();

    dropOn(container, new File(["x"], "quill.docx"));

    await waitFor(() => expect(memoField()).toHaveValue("dropped text"));
    expect(screen.getByText(/From quill.docx/)).toBeInTheDocument();
  });

  it("forgets the file's figures once the text is cleared, so they cannot leak into a pasted memo", async () => {
    mocked.parseMemoFile.mockResolvedValue({
      ok: true,
      value: { title: "Quill", markdown: "text", figures: [{ index: 1, mediaType: "image/png", data: "QUJD" }] },
    });
    const { container, user } = setup();
    choose(container, new File(["x"], "quill.docx"));
    await waitFor(() => expect(memoField()).toHaveValue("text"));

    await user.clear(memoField());
    expect(screen.queryByText(/From quill.docx/)).not.toBeInTheDocument();

    await user.type(memoField(), "a fresh memo");
    await user.click(screen.getByRole("button", { name: "Build the flow" }));
    expect(mocked.createSession).toHaveBeenCalledWith("a fresh memo", []);
  });
});
