/// <reference types="vite/client" />

import type { ComposeApi } from '../shared/compose-channels'
import type { MailApi } from '../shared/ipc'

declare global {
  interface Window {
    mailApi: MailApi
    /** Compose-session bridge (Lane C); absent in unit tests and old preloads. */
    mailCompose?: ComposeApi
  }
}

export {}
