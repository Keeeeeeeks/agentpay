import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/apay/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    allowedHosts: ['clawdinas-mac-mini.tail677558.ts.net'],
    proxy: {
      '/apay/api': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/apay/, ''),
      },
      '/apay/health': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/apay/, ''),
      },
    },
  },
})
