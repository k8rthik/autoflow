import type { TranscriptSegment } from "@autoflow/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepgramTranscriber } from "../src/deepgram.ts";
import type { OpenOptions, TranscriptionError } from "../src/types.ts";
import { fakeDeepgram, results, type FakeConnection } from "./fake-socket.ts";

const audio = (...bytes: number[]): Uint8Array => Uint8Array.from(bytes);

const openStream = (options?: OpenOptions, closeTimeoutMs = 5_000) => {
  const deepgram = fakeDeepgram();
  let n = 0;
  const transcriber = createDeepgramTranscriber({
    apiKey: "dg-test-key",
    connect: deepgram.connect,
    makeId: () => `stream${++n}`,
    closeTimeoutMs,
  });
  const segments: TranscriptSegment[] = [];
  const errors: TranscriptionError[] = [];
  const stream = transcriber.open({ onSegment: (s) => segments.push(s), onError: (e) => errors.push(e) }, options);
  const connection = deepgram.connections[0] as FakeConnection;
  return { transcriber, stream, connection, segments, errors, deepgram };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("connecting to Deepgram", () => {
  it("asks for interim results from nova-3 and authenticates with the key it was given", () => {
    const { connection } = openStream();
    const url = new URL(connection.request.url);

    expect(`${url.origin}${url.pathname}`).toBe("wss://api.deepgram.com/v1/listen");
    expect(url.searchParams.get("model")).toBe("nova-3");
    expect(url.searchParams.get("interim_results")).toBe("true");
    expect(url.searchParams.get("smart_format")).toBe("true");
    expect(url.searchParams.has("encoding")).toBe(false);
    expect(connection.request.apiKey).toBe("dg-test-key");
  });

  it("sends the room's vocabulary as keyterms, once each, without blanks", () => {
    const { connection } = openStream({ vocabulary: ["Larkspur", " ARR ", "", "Larkspur", "Priya Raman"] });
    expect(new URL(connection.request.url).searchParams.getAll("keyterm")).toEqual(["Larkspur", "ARR", "Priya Raman"]);
  });
});

describe("sending audio", () => {
  it("holds audio sent before the connection is up and delivers it in order once it is", () => {
    const { stream, connection } = openStream();
    stream.send(audio(1));
    stream.send(audio(2));
    expect(connection.sent).toEqual([]);

    connection.handlers.onOpen();
    stream.send(audio(3));

    expect(connection.sent).toEqual([audio(1), audio(2), audio(3)]);
  });
});

describe("turning results into segments", () => {
  it("revises one segment while it is interim, finalizes it under the same id, then starts the next", () => {
    const { connection, segments } = openStream();
    connection.handlers.onOpen();

    connection.handlers.onMessage(results({ start: 0, duration: 0.8, isFinal: false, transcript: "the churn" }));
    connection.handlers.onMessage(results({ start: 0, duration: 1.6, isFinal: false, transcript: "the churn number is" }));
    connection.handlers.onMessage(results({ start: 0, duration: 2.25, isFinal: true, transcript: "The churn number is wrong.", confidence: 0.97 }));
    connection.handlers.onMessage(results({ start: 2.25, duration: 0.5, isFinal: false, transcript: "why" }));

    expect(segments).toEqual([
      { id: "stream1:0", text: "the churn", startMs: 0, endMs: 800, final: false, confidence: 0.9 },
      { id: "stream1:0", text: "the churn number is", startMs: 0, endMs: 1600, final: false, confidence: 0.9 },
      { id: "stream1:0", text: "The churn number is wrong.", startMs: 0, endMs: 2250, final: true, confidence: 0.97 },
      { id: "stream1:1", text: "why", startMs: 2250, endMs: 2750, final: false, confidence: 0.9 },
    ]);
  });

  it("says nothing about silence", () => {
    const { connection, segments } = openStream();
    connection.handlers.onOpen();

    connection.handlers.onMessage(results({ start: 0, duration: 1, isFinal: false, transcript: "" }));
    connection.handlers.onMessage(results({ start: 0, duration: 2, isFinal: true, transcript: "  " }));
    connection.handlers.onMessage(results({ start: 2, duration: 1, isFinal: true, transcript: "Next point." }));

    expect(segments).toEqual([{ id: "stream1:1", text: "Next point.", startMs: 2000, endMs: 3000, final: true, confidence: 0.9 }]);
  });

  it("finalizes a shown guess as empty when Deepgram withdraws it, so the view can drop the line", () => {
    const { connection, segments } = openStream();
    connection.handlers.onOpen();

    connection.handlers.onMessage(results({ start: 0, duration: 0.4, isFinal: false, transcript: "uh" }));
    connection.handlers.onMessage(results({ start: 0, duration: 0.6, isFinal: true, transcript: "" }));

    expect(segments.at(-1)).toMatchObject({ id: "stream1:0", text: "", final: true });
  });

  it("ignores metadata, speech events and frames it cannot read", () => {
    const { connection, segments, errors } = openStream();
    connection.handlers.onOpen();

    connection.handlers.onMessage(JSON.stringify({ type: "Metadata", request_id: "r" }));
    connection.handlers.onMessage(JSON.stringify({ type: "SpeechStarted", timestamp: 1.2 }));
    connection.handlers.onMessage(JSON.stringify({ type: "UtteranceEnd", last_word_end: 2.1 }));
    connection.handlers.onMessage("not json");

    expect(segments).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("gives each stream its own segment ids, since arguments cite segments by id", () => {
    const { transcriber, deepgram, connection, segments } = openStream();
    transcriber.open({ onSegment: (s) => segments.push(s), onError: () => {} });
    const second = deepgram.connections[1] as FakeConnection;

    connection.handlers.onMessage(results({ start: 0, duration: 1, isFinal: true, transcript: "First room mic." }));
    second.handlers.onMessage(results({ start: 0, duration: 1, isFinal: true, transcript: "Second room mic." }));

    expect(segments.map((s) => s.id)).toEqual(["stream1:0", "stream2:0"]);
  });
});

describe("closing", () => {
  it("asks Deepgram to flush, delivers what it flushes, and resolves when Deepgram closes", async () => {
    const { stream, connection, segments, errors } = openStream();
    connection.handlers.onOpen();
    let closed = false;
    const closing = stream.close().then(() => {
      closed = true;
    });

    expect(connection.sent).toEqual([{ type: "CloseStream" }]);
    connection.handlers.onMessage(results({ start: 0, duration: 1, isFinal: true, transcript: "Last words." }));
    await Promise.resolve();
    expect(closed).toBe(false);

    connection.handlers.onClose(1000, "");
    await closing;

    expect(segments.map((s) => s.text)).toEqual(["Last words."]);
    expect(errors).toEqual([]);
  });

  it("closing before the connection is up still sends the held audio first", async () => {
    const { stream, connection } = openStream();
    stream.send(audio(7));
    const closing = stream.close();

    connection.handlers.onOpen();
    expect(connection.sent).toEqual([audio(7), { type: "CloseStream" }]);

    connection.handlers.onClose(1000, "");
    await closing;
  });

  it("drops the connection if Deepgram never finishes closing", async () => {
    vi.useFakeTimers();
    const { stream, connection, errors } = openStream(undefined, 2_000);
    connection.handlers.onOpen();
    const closing = stream.close();

    await vi.advanceTimersByTimeAsync(2_000);
    await closing;

    expect(connection.terminated).toBe(true);
    expect(errors).toEqual([]);
  });

  it("ignores audio sent after close", () => {
    const { stream, connection } = openStream();
    connection.handlers.onOpen();
    void stream.close();
    stream.send(audio(9));

    expect(connection.sent).toEqual([{ type: "CloseStream" }]);
  });

  it("returns the same promise however many times it is asked to close", () => {
    const { stream, connection } = openStream();
    connection.handlers.onOpen();
    expect(stream.close()).toBe(stream.close());
    expect(connection.sent).toEqual([{ type: "CloseStream" }]);
  });
});

describe("failures", () => {
  it("reports a refused connection, such as a bad key, once, and lets close resolve", async () => {
    const { stream, connection, errors } = openStream();
    connection.handlers.onError(new Error("Unexpected server response: 401"));
    connection.handlers.onClose(1006, "");

    expect(errors).toEqual([{ code: "CONNECTION_FAILED", message: "Could not connect to Deepgram: Unexpected server response: 401" }]);
    await stream.close();
  });

  it("reports Deepgram dropping a stream nobody asked to close, with its code and reason", async () => {
    const { stream, connection, errors } = openStream();
    connection.handlers.onOpen();
    connection.handlers.onClose(1011, "NET-0001: no audio received");

    expect(errors).toEqual([{ code: "CLOSED_UNEXPECTEDLY", message: "Deepgram closed the stream (1011: NET-0001: no audio received)" }]);
    stream.send(audio(1));
    expect(connection.sent).toEqual([]);
    await stream.close();
  });

  it("reports an error frame once and drops the connection", async () => {
    const { stream, connection, errors, segments } = openStream();
    connection.handlers.onOpen();
    connection.handlers.onMessage(JSON.stringify({ type: "Error", description: "Audio could not be decoded" }));
    connection.handlers.onMessage(results({ start: 0, duration: 1, isFinal: true, transcript: "too late" }));
    connection.handlers.onClose(1006, "");

    expect(errors).toEqual([{ code: "PROVIDER_ERROR", message: "Deepgram: Audio could not be decoded" }]);
    expect(connection.terminated).toBe(true);
    expect(segments).toEqual([]);
    await stream.close();
  });
});
