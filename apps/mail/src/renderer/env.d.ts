/// <reference types="vite/client" />

import type { MailApi } from '../shared/ipc'

declare global {
  interface Window {
    mailApi: MailApi
  }
}

export {}
