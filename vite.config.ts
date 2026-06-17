import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/college-baseball-sim/',
  plugins: [react()],
});
