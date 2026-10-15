import { defineConfig } from 'vitest/config'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({ plugins: [react(), tailwindcss()], resolve: { alias: { '@': path.resolve(__dirname, './src') } }, test: { environment: 'jsdom', globals: true, exclude: ['node_modules', 'e2e'] } })
