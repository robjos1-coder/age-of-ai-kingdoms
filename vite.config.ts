import { defineConfig } from 'vite';

// Relative base so the build works at https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  server: { port: 5299, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
