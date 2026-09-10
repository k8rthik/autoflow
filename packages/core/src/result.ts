export type FlowErrorCode =
  | "CLAIM_EXISTS"
  | "CLAIM_NOT_FOUND"
  | "ARGUMENT_EXISTS"
  | "ARGUMENT_NOT_FOUND"
  | "ARROW_CROSSES_ROWS"
  | "ARROW_POINTS_FORWARD"
  | "INVALID_MERGE";

export interface FlowError {
  readonly code: FlowErrorCode;
  readonly message: string;
  /** Set by `replay` to identify which event in the log failed. */
  readonly eventIndex?: number;
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: FlowError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = <T = never>(code: FlowErrorCode, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});

/** Chains a function over a successful result; passes failures through untouched. */
export const andThen = <A, B>(result: Result<A>, fn: (value: A) => Result<B>): Result<B> =>
  result.ok ? fn(result.value) : result;
