import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/mahjong-trainer/',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
} as any);
