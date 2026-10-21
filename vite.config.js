import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

// GM_BUILD_OUT: set by JS_SDK_2.0/tools/build.mjs (npm run build). The bundle lands straight in the portal build
// folder as framework.js (+ css/style.css); the kit adds loader.js, stamps index.html and wraps the portal shell.
const gmOut = process.env.GM_BUILD_OUT;

/** Icons/ and Language/ sit next to index.html (the kit's webDir is the project root): the dev server serves them
 * from there, the build copies them beside the page, untouched, like public/ */
const sdkStatic = (outDir) => ({
  name: 'gm-sdk-static',
  apply: 'build',
  closeBundle() {
    for (const dir of ['Icons', 'Language']) cpSync(resolve(dir), resolve(outDir, dir), { recursive: true });
  },
});

/** the minifier keeps template strings as they are, so the GLSL inside them (three.js chunks, src/render shaders)
 * still carries its comments; the kit's check_build.py refuses any comment in the shipped files */
const stripShaderComments = () => ({
  name: 'gm-strip-shader-comments',
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
export default defineConfig({
  base: './',
  server: { port: Number(process.env.PORT) || 5173, hmr: process.env.NO_HMR ? false : undefined },
  define: gmOut ? { __GM_BUILD__: 'true' } : {},
  plugins: [sdkStatic(gmOut || 'dist'), ...(gmOut ? [stripShaderComments()] : [])],
  build: gmOut
    ? {
        target: 'es2022',
        outDir: gmOut,
        emptyOutDir: true,
        assetsDir: '.',
        chunkSizeWarningLimit: 4000,
        rollupOptions: {
          output: {
            entryFileNames: 'framework.js',
            assetFileNames: (a) => (/\.css$/.test(a.names?.[0] ?? a.name ?? '') ? 'css/style.css' : 'build/[name]-[hash][extname]'),
          },
        },
      }
    : { target: 'es2022', assetsDir: 'build', chunkSizeWarningLimit: 2000 },
});
