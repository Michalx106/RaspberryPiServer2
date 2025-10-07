import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiPort = process.env.API_PORT || process.env.PORT || 80

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: `http://192.168.0.151:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
})
