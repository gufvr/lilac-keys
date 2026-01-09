import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: new URL('index.html', import.meta.url).pathname,
        content: new URL('src/content/content.ts', import.meta.url).pathname,
        background: new URL('src/background/background.ts', import.meta.url)
          .pathname,
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
})
