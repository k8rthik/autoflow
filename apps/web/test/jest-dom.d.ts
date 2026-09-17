import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

/**
 * jest-dom v6 still augments Vitest's old single-parameter `Assertion<T>`, while Vitest 5 declares
 * `Assertion<R, T>` (R = the matcher's return type, T = the value under test). The arities do not
 * merge, so the matchers register at runtime but never reach the type checker. This restates the
 * augmentation against the current shape; delete it once jest-dom ships Vitest 5 types.
 */
declare module "vitest" {
  interface Assertion<R, T> extends TestingLibraryMatchers<unknown, R> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
}
