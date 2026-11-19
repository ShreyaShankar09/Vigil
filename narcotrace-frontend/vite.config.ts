import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: false,
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons.svg'],
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,svg,png,woff2,json,webmanifest}'],
      },
      devOptions: { enabled: true },
      manifest: {
        name: 'VIGIL - NarcoTrace',
        short_name: 'VIGIL',
        description: 'Offline-capable presumptive test evidence capture',
        theme_color: '#0a1018',
        background_color: '#0a1018',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
  },
})
