import { build } from 'vite';
import { rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch') ? {} : null;
if (watch) {
  // Each watcher shares dist/: clear once, never during an incremental rebuild.
  await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
}
for (const configFile of ['vite.config.ts', 'vite.content.config.ts']) {
  const result = await build({
    configFile,
    build: { watch, ...(watch ? { emptyOutDir: false } : {}) },
  });
  if (watch && 'on' in result) {
    // Finish the popup's initial clean build before starting the content watcher.
    await new Promise((resolve, reject) => {
      const onEvent = (event) => {
        if (event.code === 'END' || event.code === 'ERROR') {
          result.off('event', onEvent);
          if (event.code === 'ERROR') reject(event.error);
          else resolve();
        }
      };
      result.on('event', onEvent);
    });
  }
}
