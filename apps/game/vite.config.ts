import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // Usa o código-fonte do pacote compartilhado direto, sem precisar compilá-lo antes.
  resolve: { alias: { "@bigriver/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) } },
  server: { port: 5173, host: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    // index.html é o jogo em 3D (Three.js); 2d.html é o cliente isométrico antigo (Phaser), só para comparar.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        legacy2d: fileURLToPath(new URL("2d.html", import.meta.url)),
      },
    },
  },
});
