import type {
  MailEnvelope,
  MailIntent,
  MailStore,
  SendRequest,
  SyncState,
} from '@genoffice/mail-protocols'

/**
 * In-memory MailStore stub for P3 UI dev (Lane S owns). Holds envelopes,
 * drafts, outbox status, offline intents and sync state; the SQLite engine
 * (reusing the shell file-index layer, locked D7) is a later phase.
 * No secrets, no sockets, no Electron — safe for vitest.
 */
export class InMemoryMailStore implements MailStore {
  private envelopes = new Map<string, MailEnvelope>()
  private drafts = new Map<string, string>()
  private outbox: Array<{ id: string; req: SendRequest }> = []
  private intents = new Map<string, MailIntent>()
  private sync = new Map<string, SyncState>()
  private nextId = 1

  upsertEnvelopes(env: MailEnvelope[]): void {
    for (const item of env) {
      this.envelopes.set(`${item.ref.folderId}/${item.ref.uid}`, item)
    }
  }

  getThread(threadId: string): MailEnvelope[] {
    return [...this.envelopes.values()].filter((item) => item.ref.threadId === threadId)
  }

  enqueueSend(req: SendRequest): string {
    const id = `outbox-${this.nextId++}`
    this.outbox.push({ id, req })
    return id
  }

  /** Unsent outbox entries for the dirty guard (compose text handled renderer-side). */
  outboxSize(): number {
    return this.outbox.length
  }

  saveDraft(accountId: string, threadKey: string, text: string): void {
    this.drafts.set(`${accountId}/${threadKey}`, text)
  }

  draftFor(accountId: string, threadKey: string): string | undefined {
    return this.drafts.get(`${accountId}/${threadKey}`)
  }

  queueIntent(it: Omit<MailIntent, 'id' | 'state'>): string {
    const id = `intent-${this.nextId++}`
    this.intents.set(id, { ...it, id, state: 'queued' })
    return id
  }

  pendingIntents(accountId: string): MailIntent[] {
    return [...this.intents.values()].filter(
      (it) => it.accountId === accountId && it.state === 'queued',
    )
  }

  markIntent(id: string, state: 'acked' | 'failed'): void {
    const current = this.intents.get(id)
    if (current) this.intents.set(id, { ...current, state })
  }

  setSyncState(s: SyncState): void {
    this.sync.set(`${s.accountId}/${s.folderId}`, s)
  }

  getSyncState(accountId: string, folderId: string): SyncState | undefined {
    return this.sync.get(`${accountId}/${folderId}`)
  }

  fts(query: string, accountIds: string[]): MailEnvelope[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    void accountIds
    return [...this.envelopes.values()].filter((item) =>
      [item.subject, item.snippet, ...item.from, ...item.to]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }
}

let shared: InMemoryMailStore | null = null

/** Process-wide stub store for UI dev; lanes R/C register IPC handlers against it. */
export function getMailStore(): InMemoryMailStore {
  shared ??= new InMemoryMailStore()
  return shared
}
