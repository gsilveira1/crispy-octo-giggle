import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // Usa o código-fonte do pacote compartilhado direto, sem precisar compilá-lo antes.
  resolve: { alias: { "@bigriver/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) } },
  server: { port: 5173, host: true },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
});
