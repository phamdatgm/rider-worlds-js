import { readFileSync } from 'node:fs';

const game = JSON.parse(readFileSync('public/game.json', 'utf8'));

export default {
  base: './',
  build: {
    outDir: `export/build/${game.version}-${game.id}`,
    emptyOutDir: true,
    target: 'es2017',
    modulePreload: false,
    copyPublicDir: true,
    rollupOptions: {
      input: 'src/main.js',
      output: { format: 'iife', entryFileNames: 'game.js', inlineDynamicImports: true, assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
};
