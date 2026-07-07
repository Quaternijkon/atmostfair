import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/framer-motion/')) return 'motion-vendor'
          if (
            [
              '/react/',
              '/react-dom/',
              '/react-router-dom/',
              '/history/',
            ].some((dependency) => id.includes(dependency))
          ) {
            return 'react-vendor'
          }
          return 'vendor'
        },
      },
    },
  },
})
