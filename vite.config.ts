import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'chrome111',
    outDir: 'dist',
    rollupOptions: { input: resolve(import.meta.dirname, 'src/popup/index.html') },
  },
});
