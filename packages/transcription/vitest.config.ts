import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "transcription", include: ["test/**/*.test.ts"] },
});
