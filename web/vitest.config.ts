import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // jsdom focus and scroll shims are process-global. Running UI files in
    // parallel lets user-event patch shared DOM focus globals recursively.
    fileParallelism: false,
  },
});
