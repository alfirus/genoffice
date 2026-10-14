/**
 * Mail provider contract for GenOffice Mail (Phase-2 P1).
 *
 * This file copies the interface sketch from the amended architecture spec
 * (genoffice-mail-arch-spec-amended.md, section 3.2/4.2) verbatim, plus the
 * small supporting types the IMAP/SMTP driver needs (query, events, intents,
 * sync state). The canonical home of these types is Lane A (skeleton lane);
 * when the lanes merge, Lane A's definitions win and this file is removed.
 * Names here match the spec exactly so the driver compiles either way.
 */

export interface MailFolder {
  id: string
  name: string
  role: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'
  unread: number
}

export interface MailMessageRef {
  uid: string
  folderId: string
  msgIdHeader?: string
  threadId: string
}

export interface MailFlags {
  seen: boolean
  flagged: boolean
  answered: boolean
  draft: boolean
}

export interface MailEnvelope {
  ref: MailMessageRef
  from: string[]
  to: string[]
  cc: string[]
  subject: string
  date: string
  flags: MailFlags
  labels: string[]
  snippet: string
  hasAttach: boolean
}

export interface MailBody {
  text: string
  htmlRef?: string
}

/** Attachment staged on disk (spec 4.2/5): never a full blob in SQLite. */
export interface StagedAttachment {
  filename: string
  mime: string
  /** Byte size of the staged file, used for send-cap accounting. */
  size: number
  /** Content-addressed store path. The driver streams from here on send. */
  blobPath?: string
  /** Memory payload for tests and tiny inline parts. Prefer blobPath. */
  data?: Uint8Array
}

export interface SendRequest {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text: string
  html?: string
  attachments?: StagedAttachment[]
}

/** Server-side search expansion. Local FTS first; this is the explicit server call (spec 4.3.5). */
export interface MailQuery {
  text?: string
  from?: string
  to?: string
  subject?: string
  seen?: boolean
  flagged?: boolean
  hasAttach?: boolean
  since?: string
  before?: string
}

export type MailEvent =
  | { type: 'message-new'; folderId: string; uid: string }
  | { type: 'message-updated'; folderId: string; uid: string }
  | { type: 'message-deleted'; folderId: string; uid: string }
  | {
      type: 'resync'
      folderId: string
      reason: 'uidvalidity-changed' | 'modseq-expired' | 'manual'
    }
  | { type: 'conflict'; folderId: string; uid: string; detail: string }
  | { type: 'sync-error'; folderId: string; message: string }

export interface MailIntent {
  id: string
  accountId: string
  kind: 'move' | 'flag' | 'delete' | 'label'
  targetUid: string
  expectedModseq?: string
  payloadJson: string
  state: 'queued' | 'acked' | 'failed'
}

export interface SyncState {
  accountId: string
  folderId: string
  uidValidity: number
  highestModseq?: string
  lastSyncAt: string
}

export interface MailProvider {
  connect(): Promise<void>
  disconnect(): Promise<void>
  listFolders(): Promise<MailFolder[]>
  list(folderId: string, range: { afterUid?: string; limit: number }): Promise<MailEnvelope[]>
  search(folderId: string, query: MailQuery): Promise<MailEnvelope[]>
  fetch(ref: MailMessageRef): Promise<MailBody>
  send(req: SendRequest): Promise<{ outboxId: string }>
  move(ref: MailMessageRef, toFolderId: string): Promise<void>
  setFlags(ref: MailMessageRef, flags: Partial<MailFlags>): Promise<void>
  delete(ref: MailMessageRef): Promise<void>
  watch(handler: (ev: MailEvent) => void): { stop(): void }
}
