import type { FlowEvent, FlowState } from "@autoflow/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { applyEvent, decodeDoc, emptyDoc, encodeDoc, projectDoc, undoLast, type FlowDoc } from "./store.ts";

const STORAGE_KEY = "autoflow.doc.v1";

const readStored = (): FlowDoc => {
  try {
    return decodeDoc(window.localStorage.getItem(STORAGE_KEY)) ?? emptyDoc();
  } catch {
    return emptyDoc();
  }
};

export interface FlowActions {
  readonly load: (doc: FlowDoc) => void;
  readonly apply: (event: FlowEvent) => string | null;
  readonly undo: () => void;
  readonly reset: () => void;
}

/** Owns the document, persists it, and exposes the projected state plus the few actions the UI needs. */
export const useFlowDoc = (): { doc: FlowDoc; state: FlowState; actions: FlowActions } => {
  const [doc, setDoc] = useState<FlowDoc>(readStored);
  const state = useMemo(() => projectDoc(doc), [doc]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, encodeDoc(doc));
    } catch {
      // Storage may be unavailable (private mode, quota); the session still works in memory.
    }
  }, [doc]);

  const apply = useCallback(
    (event: FlowEvent): string | null => {
      const result = applyEvent(doc, state, event);
      if (!result.ok) return result.error.message;
      setDoc(result.value);
      return null;
    },
    [doc, state],
  );

  const actions = useMemo<FlowActions>(
    () => ({
      load: (next) => setDoc(next),
      apply,
      undo: () => setDoc((d) => undoLast(d)),
      reset: () => setDoc(emptyDoc()),
    }),
    [apply],
  );

  return { doc, state, actions };
};
