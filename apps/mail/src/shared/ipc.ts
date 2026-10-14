import type { Lang } from '@genoffice/i18n'
import type { AiPanelPrefs } from '@genoffice/ui'
import type {
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  GenSparkAccountStatus,
} from '@genoffice/ai-provider'

/**
 * CANONICAL mail channel table (Lane S owns this file — Lane R/C consume,
 * never edit). Names are locked by the P3 app-shell spec amendment; zod
 * schemas for each payload live in `./ipc-schemas` (sheets precedent: this
 * file stays zod-free so the preload can import it).
 *
 * Lane C's compose-session extras (beyond this table) live in a separate
 * `compose-channels.ts` (Lane C owns); the table rows for compose-send /
 * save-draft / outbox-status stay here as the canonical names. The outbox
 * intent-recording stub shape itself is Lane C's call.
 */
export const MAIL_CHANNELS = {
  openMessage: 'mail:open-message',
  listAccounts: 'mail:list-accounts',
  addAccount: 'mail:add-account',
  removeAccount: 'mail:remove-account',
  listFolders: 'mail:list-folders',
  listMessages: 'mail:list-messages',
  fetchBody: 'mail:fetch-body',
  searchLocal: 'mail:search-local',
  searchServer: 'mail:search-server',
  composeSend: 'mail:compose-send',
  saveDraft: 'mail:save-draft',
  outboxStatus: 'mail:outbox-status',
  move: 'mail:move',
  flags: 'mail:flags',
  delete: 'mail:delete',
  syncEvents: 'mail:sync-events',
  attachmentFetch: 'mail:attachment-fetch',
  attachmentProgress: 'mail:attachment-progress',
  dirtyChanged: 'mail:dirty-changed',
  closeSaveRequest: 'mail:close-save-request',
  closeSaveResult: 'mail:close-save-result',
  getLanguage: 'app:get-language',
  languageChanged: 'app:language-changed',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
} as const

export type MailChannel = (typeof MAIL_CHANNELS)[keyof typeof MAIL_CHANNELS]

export type UiTheme = 'light' | 'dark' | 'system'

export interface MailAccountSummary {
  accountId: string
  label: string
  /** sessions only on Linux without a keyring; never a secret here */
  sessionOnly: boolean
}

export interface MessagePage {
  envelopes: import('@genoffice/mail-protocols').MailEnvelope[]
  /** opaque cursor for the next page; absent when fully loaded */
  cursor?: string
}

export interface OutboxStatus {
  queued: number
  failed: number
}

/** API exposed by the preload to the renderer (window.mailApi). */
export interface MailApi {
  /** Open (or focus) the mail tab for a mailRef; resolves the tab id. */
  openMessage(mailRef: string): Promise<string | null>
  listAccounts(): Promise<MailAccountSummary[]>
  addAccount(label: string): Promise<MailAccountSummary>
  removeAccount(accountId: string): Promise<void>
  listFolders(accountId: string): Promise<import('@genoffice/mail-protocols').MailFolder[]>
  listMessages(
    accountId: string,
    folderId: string,
    limit: number,
    cursor?: string,
  ): Promise<MessagePage>
  fetchBody(
    ref: import('@genoffice/mail-protocols').MailMessageRef,
  ): Promise<import('@genoffice/mail-protocols').MailBody>
  searchLocal(
    accountIds: string[],
    query: import('@genoffice/mail-protocols').MailQuery,
  ): Promise<import('@genoffice/mail-protocols').MailEnvelope[]>
  searchServer(
    accountId: string,
    folderId: string,
    query: import('@genoffice/mail-protocols').MailQuery,
  ): Promise<import('@genoffice/mail-protocols').MailEnvelope[]>
  composeSend(req: import('@genoffice/mail-protocols').SendRequest): Promise<{ outboxId: string }>
  saveDraft(accountId: string, threadKey: string, text: string): Promise<void>
  outboxStatus(accountId: string): Promise<OutboxStatus>
  move(
    ref: import('@genoffice/mail-protocols').MailMessageRef,
    toFolderId: string,
    expectedModseq?: string,
  ): Promise<void>
  setFlags(
    ref: import('@genoffice/mail-protocols').MailMessageRef,
    flags: Partial<import('@genoffice/mail-protocols').MailFlags>,
    expectedModseq?: string,
  ): Promise<void>
  deleteMessage(
    ref: import('@genoffice/mail-protocols').MailMessageRef,
    expectedModseq?: string,
  ): Promise<void>
  /** Push events from main (refs/flags only, never bodies or secrets). */
  onSyncEvent(handler: (event: import('@genoffice/mail-protocols').MailEvent) => void): () => void
  attachmentFetch(attachmentPath: string): Promise<{ ok: boolean; path?: string }>
  onAttachmentProgress(handler: (completed: number, total: number) => void): () => void
  /** Mirror unsaved-changes state to the main process; drives the draft prompt before closing a tab */
  setDirty(dirty: boolean): void
  /** Main process picked "Save draft" in the close prompt → renderer saves and replies via sendCloseSaveResult */
  onCloseSaveRequest(handler: () => void): () => void
  sendCloseSaveResult(ok: boolean): void
  getLanguage(): Promise<Lang>
  onLanguageChanged(handler: (lang: Lang) => void): () => void
  getTheme(): Promise<UiTheme>
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  getAiPanelPrefs(): Promise<AiPanelPrefs>
  onAiPanelPrefsChanged(handler: (prefs: AiPanelPrefs) => void): () => void
  /**
   * Fire-and-forget: a pointerdown landed on the shell chrome (tab strip is a
   * sibling WebContentsView whose clicks produce no DOM event here).
   */
  onChromePressed(handler: () => void): () => void
  getAiSettings(): Promise<AiSettings>
  aiGskStatus(): Promise<GenSparkAccountStatus>
  aiStream(request: AiStreamRequest): Promise<void>
  aiStreamCancel(requestId: string): Promise<void>
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
}

/** AI channels are app-wide shared ipcMain handlers (shell registers via docs-main registerAiIpc); pass-through only */
export const AI_CHANNELS = {
  getSettings: 'ai:get-settings',
  gskStatus: 'ai:gsk-status',
  stream: 'ai:stream',
  streamChunk: 'ai:stream-chunk',
  streamCancel: 'ai:stream-cancel',
  webSearch: 'ai:web-search',
  imageSearch: 'ai:image-search',
  fetchImage: 'ai:fetch-image',
} as const
