import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite Configuration
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})