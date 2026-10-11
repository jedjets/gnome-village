// vite.config.ts
// Vite + Vitest configuration. Single-file build to dist/index.html (03 section 14).
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Relative base so dist/index.html also works from file:// (03 section 14, Capacitor item 10).
  // Register section 7: becomes '/parque-damour/' after the move to the new repository.
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    // Fonts (src/fonts/*.woff2) inline as data URIs so dist/ is exactly one file.
    assetsInlineLimit: 1_000_000,
    cssCodeSplit: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
