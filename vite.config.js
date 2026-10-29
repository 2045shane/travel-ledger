import { defineConfig } from 'vite';

// Project Pages live at /travel-ledger/. Local dev and preview stay at /.
const base = process.env.GITHUB_PAGES === 'true' ? '/travel-ledger/' : '/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
