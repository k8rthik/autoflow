import type { StorageResult } from "./types.ts";

export const sessionNotFound = <T>(id: string): StorageResult<T> => ({
  ok: false,
  error: { code: "SESSION_NOT_FOUND", message: `No session ${id}` },
});

export const sessionExists = <T>(id: string): StorageResult<T> => ({
  ok: false,
  error: { code: "SESSION_EXISTS", message: `Session ${id} already exists` },
});

export const staleWrite = <T>(currentSeq: number): StorageResult<T> => ({
  ok: false,
  error: {
    code: "STALE_WRITE",
    message: `The log has moved on: it is at sequence ${currentSeq}`,
    currentSeq,
  },
});
