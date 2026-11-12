import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))
const rawBase = process.env.PHONE_BASE?.trim() || '/'
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`

/**
 * Build séparé de l'application téléphone. `PHONE_BASE` permet d'adapter le
 * chemin au dépôt GitHub Pages (par exemple `/planner/`).
 */
export default defineConfig({
  root,
  base,
  publicDir: resolve(root, 'public-phone'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(root, 'src')
    }
  },
  build: {
    outDir: resolve(root, 'dist-phone'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        phone: resolve(root, 'phone.html')
      }
    }
  }
})
