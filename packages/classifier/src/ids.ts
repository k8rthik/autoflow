import { randomUUID } from "node:crypto";
import type { IdFactory } from "./types.ts";

/** Deterministic ids for tests and fixtures: prefix1, prefix2, ... */
export const sequentialIds = (prefix: string): IdFactory => {
  let n = 0;
  return () => `${prefix}${++n}`;
};

export const randomIds = (): IdFactory => () => randomUUID();
