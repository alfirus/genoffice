import { createElement } from 'react'
import type { ReactElement } from 'react'
import type { SendRequest } from '@genoffice/mail-protocols'

/**
 * ComposeHost stub mount (Lane R owns this stub file ONLY). The real
 * rich-text implementation is Lane C's `compose/ComposeHost.tsx`; the
 * props below are the locked contract from the app-shell spec and must
 * stay identical on both sides. Lane R renders the mount point in
 * `App.tsx`; Lane C never edits `App.tsx`.
 */
export interface ComposeHostProps {
  accountId: string
  threadKey?: string
  initialDraft?: string
  onDirtyChange(dirty: boolean): void
  onSend(req: SendRequest): void
  readOnly?: boolean
}

export function ComposeHost(props: ComposeHostProps): ReactElement {
  void props
  return createElement('div', {
    className: 'mail-compose-stub',
    'data-compose-mount': 'true',
  })
}
