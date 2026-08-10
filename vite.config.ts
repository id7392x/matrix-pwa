import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

const alias = {
  $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
  $components: fileURLToPath(new URL('./src/components', import.meta.url)),
  $storage: fileURLToPath(new URL('./src/storage', import.meta.url)),
  $sync: fileURLToPath(new URL('./src/sync', import.meta.url)),
  $crypto: fileURLToPath(new URL('./src/crypto', import.meta.url)),
  $stores: fileURLToPath(new URL('./src/stores', import.meta.url)),
  $types: fileURLToPath(new URL('./src/types', import.meta.url)),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  resolve: {
    alias,
    conditions: ['browser'],
  },
  test: {
    environment: 'happy-dom',
    server: {
      deps: {
        inline: [/matrix-js-sdk/],
      },
    },
  },
})
