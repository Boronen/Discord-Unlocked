import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: "preview",
  plugins: [react()],
  resolve: {
    alias: {
      "@webpack/common": fileURLToPath(new URL("./preview/discord-adapter.tsx", import.meta.url)),
      "@components/Button": fileURLToPath(new URL("./preview/discord-adapter.tsx", import.meta.url)),
    },
  },
  build: { outDir: "../dist/preview", emptyOutDir: false },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
