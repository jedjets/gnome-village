import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Project Pages: https://jedjets.github.io/gnome-village/
export default defineConfig({
  base: '/gnome-village/',
  plugins: [react()],
})
