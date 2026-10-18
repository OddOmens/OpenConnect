import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // BASE_PATH=/studio when it is served behind OpenConnect (see server/index.ts).
  base: `${(process.env.BASE_PATH ?? '').replace(/\/+$/, '')}/`,
  build: { outDir: 'dist' },
});
