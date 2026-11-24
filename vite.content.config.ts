import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Manifest content scripts are classic scripts: emit one self-contained IIFE.
export default defineConfig({
  publicDir: false,
  build: {
    target: 'chrome111',
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.ts'),
      name: 'ChatGPTEnhanced',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
