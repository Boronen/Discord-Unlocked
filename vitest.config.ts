import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@webpack/common": fileURLToPath(new URL("./preview/discord-adapter.tsx", import.meta.url)),
      "@components/Button": fileURLToPath(new URL("./preview/discord-adapter.tsx", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
