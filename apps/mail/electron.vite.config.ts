import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  // @genoffice/i18n, @genoffice/electron-utils and @genoffice/mail-protocols
  // ship as TS source — must be bundled (same policy as apps/markdown).
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@genoffice/i18n', '@genoffice/electron-utils', '@genoffice/mail-protocols'],
      }),
    ],
  },
  preload: {
    // same bundling requirement as main (see comment above); the preload
    // stays zod-free — it imports channel names only, never the schemas.
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@genoffice/i18n', '@genoffice/electron-utils', '@genoffice/mail-protocols'],
      }),
    ],
  },
  renderer: {
    plugins: [react()],
    server: {
      port: Number(process.env.MAIL_DEV_PORT) || 5179,
      strictPort: true,
    },
  },
})
