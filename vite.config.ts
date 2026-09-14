import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, readFileSync } from "node:fs";

const copyManifest = () => ({
  name: "copy-extension-manifest",
  closeBundle() {
    copyFileSync(
      new URL("./manifest.json", import.meta.url),
      new URL("./dist/manifest.json", import.meta.url),
    );
  },
});

const validateClassicExtensionBundles = () => ({
  name: "validate-classic-extension-bundles",
  closeBundle() {
    for (const fileName of ["content.js", "background.js"]) {
      const fileUrl = new URL(`./dist/${fileName}`, import.meta.url);
      const code = readFileSync(fileUrl, "utf8");
      const hasModuleSyntax =
        /\bimport\s*(?:\{|\*|["'])/.test(code) ||
        /\bexport\s*(?:\{|default\b|const\b|let\b|var\b|function\b|class\b)/.test(
          code,
        );
      if (hasModuleSyntax) {
        throw new Error(
          `${fileName} contém import/export e não pode ser carregado como script clássico da extensão.`,
        );
      }
    }
  },
});

export default defineConfig({
  plugins: [react(), copyManifest(), validateClassicExtensionBundles()],
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
