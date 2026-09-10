import type { FlowEvent } from "./events.ts";
import { reduce } from "./reduce.ts";
import { ok, type Result } from "./result.ts";
import { emptyFlow, type FlowState } from "./types.ts";

const failAt = <T>(result: Result<T>, eventIndex: number): Result<T> =>
  result.ok ? result : { ok: false, error: { ...result.error, eventIndex } };

/** Rebuilds a flow from its event log. Stops at the first invalid event and reports its index. */
export const replay = (events: readonly FlowEvent[], initial: FlowState = emptyFlow()): Result<FlowState> =>
  events.reduce<Result<FlowState>>(
    (acc, event, index) => (acc.ok ? failAt(reduce(acc.value, event), index) : acc),
    ok(initial),
  );

/**
 * Like `replay`, but returns the state after every event (index 0 is the initial state).
 * This is what the replay view steps through. Cost is quadratic in log length, which is
 * fine for a discussion's worth of events; revisit if logs grow past a few thousand.
 */
export const replaySteps = (
  events: readonly FlowEvent[],
  initial: FlowState = emptyFlow(),
): Result<readonly FlowState[]> =>
  events.reduce<Result<readonly FlowState[]>>(
    (acc, event, index) => {
      if (!acc.ok) return acc;
      const next = failAt(reduce(acc.value[acc.value.length - 1] ?? initial, event), index);
      return next.ok ? ok([...acc.value, next.value]) : next;
    },
    ok([initial]),
  );
