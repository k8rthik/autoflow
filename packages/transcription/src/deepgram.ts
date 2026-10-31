import { randomUUID } from "node:crypto";
import { advance, CLOSE_STREAM, DEEPGRAM_LISTEN_URL, DEFAULT_DEEPGRAM_MODEL, listenUrl, parseServerMessage, START } from "./deepgram-wire.ts";
import { connectWebSocket, type Connect } from "./socket.ts";
import type { Transcriber, TranscriptionError, TranscriptionStream } from "./types.ts";

/** Long enough for Deepgram to flush the last window after CloseStream, short enough not to hold a shutdown. */
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;

export interface DeepgramTranscriberOptions {
  readonly apiKey: string;
  readonly model?: string;
  /** The listen endpoint. Points at a self-hosted Deepgram, or a fake one in tests. */
  readonly baseUrl?: string;
  readonly connect?: Connect;
  /** Prefix for segment ids. Must be unique per stream, since arguments cite segments by id. */
  readonly makeId?: () => string;
  /** How long to wait for Deepgram to flush and close after CloseStream before dropping the connection. */
  readonly closeTimeoutMs?: number;
}

/**
 * A stream's lifecycle. Audio that arrives while `connecting` is queued, because the first chunk of
 * a WebM stream carries the header the rest cannot be decoded without.
 */
type Phase =
  | { readonly name: "connecting"; readonly queued: readonly Uint8Array[]; readonly closeRequested: boolean }
  | { readonly name: "open" }
  | { readonly name: "closing" }
  | { readonly name: "closed" };

const describeClose = (code: number, reason: string): string => (reason ? `${code}: ${reason}` : String(code));

/** Deepgram streaming adapter for the Transcriber port. */
export const createDeepgramTranscriber = ({
  apiKey,
  model = DEFAULT_DEEPGRAM_MODEL,
  baseUrl = DEEPGRAM_LISTEN_URL,
  connect = connectWebSocket,
  makeId = randomUUID,
  closeTimeoutMs = DEFAULT_CLOSE_TIMEOUT_MS,
}: DeepgramTranscriberOptions): Transcriber => ({
  open(handlers, options = {}): TranscriptionStream {
    const streamId = makeId();
    let phase: Phase = { name: "connecting", queued: [], closeRequested: false };
    let cursor = START;
    let transportError: string | null = null;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let finish = (): void => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const settle = (): void => {
      phase = { name: "closed" };
      clearTimeout(closeTimer);
      finish();
    };

    const fail = (error: TranscriptionError): void => {
      settle();
      handlers.onError(error);
    };

    const beginClosing = (): void => {
      phase = { name: "closing" };
      socket.send(CLOSE_STREAM);
      closeTimer = setTimeout(() => {
        settle();
        socket.terminate();
      }, closeTimeoutMs);
    };

    const socket = connect(
      { url: listenUrl(baseUrl, { model, vocabulary: options.vocabulary ?? [] }), apiKey },
      {
        onOpen: () => {
          if (phase.name !== "connecting") return;
          const { queued, closeRequested } = phase;
          phase = { name: "open" };
          for (const audio of queued) socket.send(audio);
          if (closeRequested) beginClosing();
        },

        onMessage: (text) => {
          if (phase.name === "closed") return;
          const message = parseServerMessage(text);
          if (message.kind === "result") {
            const step = advance(cursor, message.result, streamId);
            cursor = step.cursor;
            if (step.segment) handlers.onSegment(step.segment);
          } else if (message.kind === "error") {
            fail({ code: "PROVIDER_ERROR", message: `Deepgram: ${message.message}` });
            socket.terminate();
          }
        },

        onError: (error) => {
          transportError = error.message;
        },

        onClose: (code, reason) => {
          switch (phase.name) {
            case "closed":
              return;
            case "closing":
              return settle();
            case "connecting":
              return fail({
                code: "CONNECTION_FAILED",
                message: `Could not connect to Deepgram: ${transportError ?? describeClose(code, reason)}`,
              });
            case "open":
              return fail({ code: "CLOSED_UNEXPECTEDLY", message: `Deepgram closed the stream (${describeClose(code, reason)})` });
          }
        },
      },
    );

    return {
      send: (audio) => {
        if (phase.name === "connecting") phase = { ...phase, queued: [...phase.queued, audio] };
        else if (phase.name === "open") socket.send(audio);
      },

      close: () => {
        if (phase.name === "connecting") phase = { ...phase, closeRequested: true };
        else if (phase.name === "open") beginClosing();
        return finished;
      },
    };
  },
});
