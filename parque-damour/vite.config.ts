// vite.config.ts
// Vite + Vitest configuration. Single-file builds: dist/index.html, then one self-contained file per board page (03 section 14, 07 0.5 row 4).
// Rolldown refuses `codeSplitting: false` with several inputs, and a shared chunk cannot be inlined into two pages, so each board
// is built by its own nested `build()` after the main bundle (same options, `emptyOutDir: false`). S1a adds style-board.html,
// S1b adds music-board.html to BOARDS; nothing else changes.
import { build, type InlineConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** The board pages (app root), each built to dist/<name>.html as one file. */
const BOARDS = ['style-board.html', 'music-board.html'];

/** The options every single-file build shares; `input` picks the page. */
function singleFileBuild(input: string, emptyOutDir: boolean): InlineConfig {
  return {
    configFile: false,
    // Relative base so dist/*.html also work from file:// (03 section 14, Capacitor item 10).
    // The app stays inside gnome-village (register row 4), so base stays './' (register section 7 is optional and not planned).
    base: './',
    logLevel: 'info',
    plugins: [viteSingleFile()],
    build: {
      target: 'es2022',
      // Fonts (src/fonts/*.woff2) inline as data URIs so dist/ holds only HTML files.
      assetsInlineLimit: 1_000_000,
      cssCodeSplit: false,
      emptyOutDir,
      rollupOptions: { input },
    },
  };
}

/** After the main bundle is written, build every board page into the same dist/. */
function boardPages() {
  return {
    name: 'pd:board-pages',
    apply: 'build' as const,
    async closeBundle(): Promise<void> {
      for (const page of BOARDS) await build(singleFileBuild(page, false));
    },
  };
}

const main = singleFileBuild('index.html', true);

export default defineConfig({
  base: main.base,
  plugins: [...(main.plugins ?? []), boardPages()],
  build: main.build,
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
