import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  build: {
    rollupOptions: {
      // index.html becomes the prerendered landing page; app.html stays the plain shell
      // every other path is served from.
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        app: fileURLToPath(new URL('app.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/v1': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
