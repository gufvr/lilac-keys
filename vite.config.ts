import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";

const copyManifest = () => ({
  name: "copy-extension-manifest",
  closeBundle() {
    copyFileSync(
      new URL("./manifest.json", import.meta.url),
      new URL("./dist/manifest.json", import.meta.url),
    );
  },
});

export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: new URL("index.html", import.meta.url).pathname,
        content: new URL("src/content/content.ts", import.meta.url).pathname,
        background: new URL("src/background/background.ts", import.meta.url)
          .pathname,
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
