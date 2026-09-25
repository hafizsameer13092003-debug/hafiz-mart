import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths keep the app deployable on GitHub Pages
  // project URLs and later on a custom domain.
  base: './',
});
