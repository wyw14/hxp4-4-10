import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5110,
    strictPort: true,
    open: true
  }
});