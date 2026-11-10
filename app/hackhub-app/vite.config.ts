import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // SockJS's source entry assumes Node's `global`; its browser bundle scopes it safely.
  resolve: {
    alias: [{ find: /^sockjs-client$/, replacement: 'sockjs-client/dist/sockjs.js' }],
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080' },
      '/storage': { target: 'http://127.0.0.1:80' },
      '/ws': { target: 'http://127.0.0.1:8080', ws: true },
    },
  },
  plugins: [react()],
})
