import { DEFAULT_AI_PANEL_PREFS } from '@genoffice/ui'
// Browser-safe subpath (package root drags node-only drivers into the
// renderer bundle; drivers stay main-only per the app-shell spec).
import { matchesQuery } from '@genoffice/mail-protocols/query'
import type {
  MailBody,
  MailEnvelope,
  MailFlags,
  MailFolder,
  MailMessageRef,
  MailQuery,
  SendRequest,
} from '@genoffice/mail-protocols'
import type { MailAccountSummary, MailApi, MessagePage, OutboxStatus } from '../shared/ipc'

/**
 * Renderer-side IPC fakes for Lane R UI dev and vitest (Lane R owns).
 * Implements the read/query surface of `MailApi` over seeded in-memory
 * envelopes; writes mutate local maps only. Fake addresses use
 * example.com / example.net only — never real mailboxes. The real sync
 * engine and main-process handlers are a later phase; until they land,
 * `resolveMailApi()` falls back to these fakes when no preload bridge
 * is present (plain vite dev).
 */

export interface FakeSeedMessage {
  uid: string
  folderId: string
  from: string[]
  to: string[]
  cc?: string[]
  subject: string
  date: string
  seen?: boolean
  flagged?: boolean
  snippet: string
  hasAttach?: boolean
  text: string
  html?: string
  replyTo?: string
  auth?: 'pass' | 'fail' | 'unknown'
}

export interface FakeSeed {
  accountId: string
  label: string
  folders: MailFolder[]
  messages: FakeSeedMessage[]
  /** Extra server-only hits returned by searchServer (local store lacks them). */
  serverExtra?: FakeSeedMessage[]
}

function toEnvelope(seed: FakeSeedMessage): MailEnvelope {
  return {
    ref: { uid: seed.uid, folderId: seed.folderId, threadId: `thread-${seed.uid}` },
    from: seed.from,
    to: seed.to,
    cc: seed.cc ?? [],
    subject: seed.subject,
    date: seed.date,
    flags: {
      seen: seed.seen ?? false,
      flagged: seed.flagged ?? false,
      answered: false,
      draft: false,
    },
    labels: [],
    snippet: seed.snippet,
    hasAttach: seed.hasAttach ?? false,
  }
}

function toBody(seed: FakeSeedMessage): FakeMailBody {
  return { text: seed.text, htmlRef: undefined, html: seed.html }
}

/** Fake-only body extension: P3 fakes inline HTML (never on the wire). */
export interface FakeMailBody extends MailBody {
  html?: string
}

export function defaultSeed(): FakeSeed {
  return {
    accountId: 'demo',
    label: 'Demo Account',
    folders: [
      { id: 'inbox', name: 'Inbox', role: 'inbox', unread: 3 },
      { id: 'sent', name: 'Sent', role: 'sent', unread: 0 },
      { id: 'drafts', name: 'Drafts', role: 'drafts', unread: 0 },
      { id: 'archive', name: 'Archive', role: 'archive', unread: 0 },
    ],
    messages: [
      {
        uid: 'm1',
        folderId: 'inbox',
        from: ['Acme Billing <billing@example.com>'],
        to: ['Reader <reader@example.net>'],
        subject: 'Your invoice is ready',
        date: '2026-10-10T09:00:00.000Z',
        snippet: 'Invoice INV-1042 for October is attached for review.',
        hasAttach: true,
        text: 'Hello,\n\nInvoice INV-1042 for October is attached for review.\n\nAcme Billing',
        html: '<p>Hello,</p><p>Invoice <b>INV-1042</b> for October is attached for review.</p><p style="color: #107c41;">Thank you for your business.</p>',
      },
      {
        uid: 'm2',
        folderId: 'inbox',
        from: ['Team Chat <chat@example.com>'],
        to: ['Reader <reader@example.net>'],
        subject: 'Weekly notes with a remote banner',
        date: '2026-10-11T12:30:00.000Z',
        seen: true,
        snippet: 'This week shipped the new reader with remote images blocked.',
        text: 'This week shipped the new reader with remote images blocked.',
        html: '<p>This week shipped the new reader.</p><img src="https://tracker.example.com/pixel.png" alt="Weekly banner"><p style="background-color: #fff4ce;">Remote images stay blocked until you allow them.</p>',
      },
      {
        uid: 'm3',
        folderId: 'inbox',
        from: ['Support <support@example.com>'],
        to: ['Reader <reader@example.net>'],
        subject: 'Reply-To differs on this one',
        date: '2026-10-12T08:15:00.000Z',
        snippet: 'A support note whose Reply-To points elsewhere.',
        text: 'A support note whose Reply-To points elsewhere.',
        html: '<p>A support note whose Reply-To points elsewhere.</p>',
        replyTo: 'outside@example.org',
      },
      {
        uid: 'm4',
        folderId: 'inbox',
        from: ['Acme <mail@xn--acme-pay-example.com>'],
        to: ['Reader <reader@example.net>'],
        subject: 'Lookalike sender sample',
        date: '2026-10-12T18:40:00.000Z',
        snippet: 'Sent from a localised domain that mimics a known sender.',
        text: 'Sent from a localised domain that mimics a known sender.',
        html: '<p>Sent from a localised domain that mimics a known sender.</p>',
      },
      {
        uid: 'm5',
        folderId: 'inbox',
        from: ['Flags Demo <flags@example.com>'],
        to: ['Reader <reader@example.net>'],
        subject: 'Flagged and unread sample',
        date: '2026-10-13T07:05:00.000Z',
        flagged: true,
        snippet: 'Starred so flag filters have something to match.',
        text: 'Starred so flag filters have something to match.',
      },
      {
        uid: 'm6',
        folderId: 'sent',
        from: ['Reader <reader@example.net>'],
        to: ['Acme Billing <billing@example.com>'],
        subject: 'Re: Your invoice is ready',
        date: '2026-10-13T09:20:00.000Z',
        seen: true,
        snippet: 'Thanks — paid this morning, receipt appreciated.',
        text: 'Thanks — paid this morning, receipt appreciated.',
      },
    ],
    serverExtra: [
      {
        uid: 'srv1',
        folderId: 'inbox',
        from: ['Archive Bot <archive@example.com>'],
        to: ['Reader <reader@example.net>'],
        subject: 'Server-only invoice copy',
        date: '2026-09-01T10:00:00.000Z',
        seen: true,
        snippet: 'An older invoice copy that lives on the server only.',
        text: 'An older invoice copy that lives on the server only.',
      },
    ],
  }
}

/** Local post-filter used by the search box: IPC fakes first, matchesQuery after. */
export function applyLocalSearch(envelopes: MailEnvelope[], text: string): MailEnvelope[] {
  const needle = text.trim()
  if (!needle) return envelopes
  return envelopes.filter((env) => matchesQuery(env, { text: needle }))
}

function noopUnsubscribe(): () => void {
  return () => undefined
}

export class FakeMailApi implements MailApi {
  private accounts: MailAccountSummary[]
  private folders: Map<string, MailFolder[]>
  private envelopes: MailEnvelope[]
  private bodies: Map<string, MailBody>
  private security: Map<string, { replyTo?: string; auth?: 'pass' | 'fail' | 'unknown' }>
  private outbox: SendRequest[] = []
  private drafts: Map<string, string> = new Map()

  constructor(seeds: FakeSeed[] = [defaultSeed()]) {
    this.accounts = seeds.map((seed) => ({
      accountId: seed.accountId,
      label: seed.label,
      sessionOnly: true,
    }))
    this.folders = new Map(seeds.map((seed) => [seed.accountId, [...seed.folders]]))
    this.envelopes = seeds.flatMap((seed) => seed.messages.map(toEnvelope))
    this.bodies = new Map(
      seeds.flatMap((seed) =>
        seed.messages.map(
          (message) => [`${message.folderId}/${message.uid}`, toBody(message)] as const,
        ),
      ),
    )
    this.security = new Map(
      seeds.flatMap((seed) =>
        seed.messages
          .filter((message) => message.replyTo !== undefined || message.auth !== undefined)
          .map(
            (message) =>
              [
                `${message.folderId}/${message.uid}`,
                { replyTo: message.replyTo, auth: message.auth },
              ] as const,
          ),
      ),
    )
    for (const seed of seeds) {
      for (const extra of seed.serverExtra ?? []) {
        this.bodies.set(`${extra.folderId}/${extra.uid}`, toBody(extra))
      }
    }
    this.serverExtra = seeds.flatMap((seed) => (seed.serverExtra ?? []).map(toEnvelope))
  }

  private serverExtra: MailEnvelope[]

  /** Phishing/auth metadata the envelope shape cannot carry (fake-only sidecar). */
  fakeSecurity(ref: MailMessageRef): { replyTo?: string; auth?: 'pass' | 'fail' | 'unknown' } {
    return this.security.get(`${ref.folderId}/${ref.uid}`) ?? {}
  }

  async openMessage(_mailRef: string): Promise<string | null> {
    return null
  }

  async listAccounts(): Promise<MailAccountSummary[]> {
    return [...this.accounts]
  }

  async addAccount(label: string): Promise<MailAccountSummary> {
    const account: MailAccountSummary = {
      accountId: `fake-${this.accounts.length + 1}`,
      label,
      sessionOnly: true,
    }
    this.accounts.push(account)
    this.folders.set(account.accountId, [])
    return account
  }

  async removeAccount(accountId: string): Promise<void> {
    this.accounts = this.accounts.filter((account) => account.accountId !== accountId)
    this.folders.delete(accountId)
  }

  async listFolders(accountId: string): Promise<MailFolder[]> {
    return [...(this.folders.get(accountId) ?? [])]
  }

  async listMessages(
    accountId: string,
    folderId: string,
    limit: number,
    cursor?: string,
  ): Promise<MessagePage> {
    void accountId
    const start = cursor === undefined ? 0 : Number.parseInt(cursor, 10)
    const inFolder = this.envelopes
      .filter((env) => env.ref.folderId === folderId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
    const page = inFolder.slice(start, start + limit)
    const next = start + limit < inFolder.length ? String(start + limit) : undefined
    return { envelopes: page, cursor: next }
  }

  async fetchBody(ref: MailMessageRef): Promise<MailBody> {
    return this.bodies.get(`${ref.folderId}/${ref.uid}`) ?? { text: '' }
  }

  async searchLocal(accountIds: string[], query: MailQuery): Promise<MailEnvelope[]> {
    void accountIds
    return this.envelopes.filter((env) => matchesQuery(env, query))
  }

  async searchServer(
    accountId: string,
    folderId: string,
    query: MailQuery,
  ): Promise<MailEnvelope[]> {
    void accountId
    void folderId
    const local = this.envelopes.filter((env) => matchesQuery(env, query))
    const remote = this.serverExtra.filter((env) => matchesQuery(env, query))
    return [...local, ...remote]
  }

  async composeSend(req: SendRequest): Promise<{ outboxId: string }> {
    this.outbox.push(req)
    return { outboxId: `fake-outbox-${this.outbox.length}` }
  }

  async saveDraft(accountId: string, threadKey: string, text: string): Promise<void> {
    this.drafts.set(`${accountId}/${threadKey}`, text)
  }

  async outboxStatus(_accountId: string): Promise<OutboxStatus> {
    return { queued: this.outbox.length, failed: 0 }
  }

  async move(ref: MailMessageRef, toFolderId: string): Promise<void> {
    const env = this.envelopes.find(
      (item) => item.ref.uid === ref.uid && item.ref.folderId === ref.folderId,
    )
    if (env) env.ref.folderId = toFolderId
  }

  async setFlags(ref: MailMessageRef, flags: Partial<MailFlags>): Promise<void> {
    const env = this.envelopes.find(
      (item) => item.ref.uid === ref.uid && item.ref.folderId === ref.folderId,
    )
    if (env) env.flags = { ...env.flags, ...flags }
  }

  async deleteMessage(ref: MailMessageRef): Promise<void> {
    this.envelopes = this.envelopes.filter(
      (item) => !(item.ref.uid === ref.uid && item.ref.folderId === ref.folderId),
    )
  }

  onSyncEvent(): () => void {
    return noopUnsubscribe()
  }

  async attachmentFetch(): Promise<{ ok: boolean; path?: string }> {
    return { ok: false }
  }

  onAttachmentProgress(): () => void {
    return noopUnsubscribe()
  }

  setDirty(): void {
    // Fake ignores the dirty push; the guard path is covered by shell tests.
  }

  onCloseSaveRequest(): () => void {
    return noopUnsubscribe()
  }

  sendCloseSaveResult(): void {
    // No-op in the fake; nothing is awaiting a close verdict.
  }

  async getLanguage(): Promise<'zh'> {
    return 'zh'
  }

  onLanguageChanged(): () => void {
    return noopUnsubscribe()
  }

  async getTheme(): Promise<'system'> {
    return 'system'
  }

  onThemeChanged(): () => void {
    return noopUnsubscribe()
  }

  async getAiPanelPrefs(): Promise<typeof DEFAULT_AI_PANEL_PREFS> {
    return DEFAULT_AI_PANEL_PREFS
  }

  onAiPanelPrefsChanged(): () => void {
    return noopUnsubscribe()
  }

  onChromePressed(): () => void {
    return noopUnsubscribe()
  }

  async getAiSettings(): Promise<never> {
    throw new Error('mail: AI settings are stubbed in P3')
  }

  async aiGskStatus(): Promise<never> {
    throw new Error('mail: AI status is stubbed in P3')
  }

  async aiStream(): Promise<never> {
    throw new Error('mail: AI streaming is stubbed in P3')
  }

  async aiStreamCancel(): Promise<void> {
    // No stream exists in the fake; cancelling is a no-op.
  }

  onAiStream(): () => void {
    return noopUnsubscribe()
  }
}

let sharedFake: FakeMailApi | null = null

export function sharedFakeApi(): FakeMailApi {
  sharedFake ??= new FakeMailApi()
  return sharedFake
}

/** Preload bridge when present, seeded fakes otherwise (plain vite dev). */
export function resolveMailApi(): MailApi {
  if (typeof window !== 'undefined' && window.mailApi) return window.mailApi
  return sharedFakeApi()
}
