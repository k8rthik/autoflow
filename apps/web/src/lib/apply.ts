import type { FlowEvent } from "@autoflow/core";

/**
 * Sends one correction to the server. Resolves with the reason it was refused, or null when it was
 * committed. Asynchronous because the server, not the browser, decides what enters the log.
 */
export type ApplyEvent = (event: FlowEvent) => Promise<string | null>;
