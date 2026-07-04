import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep the bundle lean: no chart libs, no CSS frameworks.
export default defineConfig({
  plugins: [react()],
  base: './', // relative paths: works on GitHub Pages subpaths AND Netlify

  build: {
    outDir: 'docs', // GitHub Pages can serve /docs directly
    target: 'es2020',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          db: ['dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
});
