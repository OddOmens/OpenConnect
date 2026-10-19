import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH=/studio when it is served behind OpenConnect (see server/index.ts).
const base = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

export default defineConfig({
  plugins: [react()],
  base: `${base}/`,
  // Read by src/base.ts; Next.js (the editor inside OpenConnect) doesn't define it.
  define: { __STUDIO_BASE__: JSON.stringify(base) },
  build: { outDir: 'dist' },
});
