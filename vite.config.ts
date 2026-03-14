import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Excalidraw has some CJS deps that need pre-bundling
    include: ['@excalidraw/excalidraw'],
  },
  build: {
    commonjsOptions: {
      include: [/excalidraw/, /node_modules/],
    },
  },
})
