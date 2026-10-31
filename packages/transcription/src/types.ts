import type { TranscriptSegment } from "@autoflow/core";

export type TranscriptionErrorCode =
  /** The provider could not be reached or refused the connection, e.g. a bad API key. */
  | "CONNECTION_FAILED"
  /** The provider dropped a stream nobody asked to close, e.g. after too long without audio. */
  | "CLOSED_UNEXPECTEDLY"
  /** The provider reported a problem with the stream, e.g. audio it could not decode. */
  | "PROVIDER_ERROR";

export interface TranscriptionError {
  readonly code: TranscriptionErrorCode;
  readonly message: string;
}

export interface TranscriptionHandlers {
  /** Called for every interim revision and every final segment, in the order the provider sent them. */
  readonly onSegment: (segment: TranscriptSegment) => void;
  /** Called at most once. The stream is closed by the time it is called. */
  readonly onError: (error: TranscriptionError) => void;
}

export interface OpenOptions {
  /** Words the room will say that a general model gets wrong: company, founder and fund names, jargon. */
  readonly vocabulary?: readonly string[];
}

/** One live audio stream. Audio sent before the provider connection is up is held, not dropped. */
export interface TranscriptionStream {
  /** Containerized audio (WebM/Opus, Ogg, WAV) as the client recorded it. Ignored once closing. */
  send(audio: Uint8Array): void;
  /** Asks the provider to finish what it has heard, and resolves once the last segment is delivered. */
  close(): Promise<void>;
}

/**
 * Port: anything that turns live room audio into transcript segments. The Deepgram adapter
 * implements it; tests use fakes. Requirements §4.3.
 */
export interface Transcriber {
  open(handlers: TranscriptionHandlers, options?: OpenOptions): TranscriptionStream;
}
