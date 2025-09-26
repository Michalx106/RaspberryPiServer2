import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiPort = process.env.API_PORT || process.env.PORT || 3000

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
})
