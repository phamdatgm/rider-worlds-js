import { defineConfig } from 'vite';

// NO_HMR=1: modules still invalidate on change, but open pages are not reloaded (headless test runs)
export default defineConfig({
  base: './',
  server: { port: Number(process.env.PORT) || 5173, hmr: process.env.NO_HMR ? false : undefined },
  build: { target: 'es2022', assetsDir: 'build', chunkSizeWarningLimit: 2000 },
});
