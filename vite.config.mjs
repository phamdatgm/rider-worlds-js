import { readFileSync } from 'node:fs';

// The kit's export package (docs/GMSDK_JS/docs/EXPORT.md §4): one iife game.js in export/build/<version>-<id>/, next
// to public/ (loader.js, game.json, i18n/, icons/, assets/). npm run build runs bump-version before this.
const game = JSON.parse(readFileSync('public/game.json', 'utf8'));

/** the minifier keeps template strings as they are, so the GLSL inside them (three.js chunks, src/render shaders)
 * still carries its comments; no dev comment ships in game.js (docs/GMSDK_JS/docs/EXPORT.md §3) */
const stripShaderComments = () => ({
  name: 'strip-shader-comments',
  apply: 'build',
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk') continue;
      chunk.code = chunk.code
        .replace(/^[ \t]*\/\/[^\n]*\n/gm, '') // whole comment lines
        .replace(/([;{}])[ \t]+\/\/[^\n`]*/g, '$1'); // trailing "statement; // comment"
    }
  },
});

// NO_HMR=1: modules still invalidate on change, but open pages are not reloaded (headless test runs)
export default {
  base: './',
  server: { port: Number(process.env.PORT) || 5173, hmr: process.env.NO_HMR ? false : undefined },
  // the dev server only: Build/ and export/ hold built pages that are not entries
  optimizeDeps: { entries: ['index.html'] },
  plugins: [stripShaderComments()],
  build: {
    outDir: `export/build/${game.version}-${game.id}`,
    emptyOutDir: true,
    target: 'es2017',
    modulePreload: false,
    copyPublicDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: 'src/main.js',
      output: { format: 'iife', entryFileNames: 'game.js', inlineDynamicImports: true, assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
};
