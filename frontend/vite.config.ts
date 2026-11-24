import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Only `?raw` stylesheet imports (read by the style contract tests) keep their text;
    // component stylesheets stay stubbed so jsdom visibility checks are unaffected.
    css: { include: [/\.css\?raw$/] },
  },
});
