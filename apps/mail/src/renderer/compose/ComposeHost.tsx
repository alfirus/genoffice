import { useEffect, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import type { SendRequest, StagedAttachment } from '@genoffice/mail-protocols'
import { useI18n } from '../i18n/locale'
import type { ComposeHostProps } from './ComposeHost'
import './compose.css'

export type { ComposeHostProps } from './ComposeHost'

/**
 * Rich-text compose (Lane C owns; Lane R owns the `ComposeHost.ts` stub and
 * the `App.tsx` mount — this file never touches either). Props are the
 * locked contract from the app-shell spec. Sends go out through `onSend`
 * (App wires it to `mail:compose-send`); drafts autosave through
 * `window.mailApi.saveDraft`; dirty mirrors the unsent-draft guard
 * (`mailIsDirty`) via `onDirtyChange`.
 *
 * Size policy mirrors `packages/mail-protocols/src/attachments.ts` locally:
 * the renderer cannot import that node:fs module, so the thresholds are
 * restated here (warn above 25 MiB total, reject files above 50 MiB) and
 * the main process re-enforces the real caps plus per-driver limits.
 */

const WARN_TOTAL_BYTES = 25 * 1024 * 1024
const REJECT_FILE_BYTES = 50 * 1024 * 1024
/** Strictest known per-driver per-file cap (Graph); main enforces the real one. */
const STRICT_DRIVER_FILE_BYTES = 3 * 1024 * 1024
const DRAFT_DEBOUNCE_MS = 800
const MAX_ATTACHMENTS = 50
const MAX_SUBJECT_CHARS = 1024
const MAX_TEXT_CHARS = 5_000_000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMPTY_SNAPSHOT = JSON.stringify({ to: '', cc: '', bcc: '', subject: '', bodyHtml: '' })

interface PendingAttachment {
  key: string
  filename: string
  mime: string
  size: number
  data: Uint8Array
}

interface DraftSnapshot {
  to: string
  cc: string
  bcc: string
  subject: string
  bodyHtml: string
}

function parseSnapshot(raw: string): DraftSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as DraftSnapshot).bodyHtml === 'string'
    ) {
      const snap = parsed as DraftSnapshot
      return {
        to: typeof snap.to === 'string' ? snap.to : '',
        cc: typeof snap.cc === 'string' ? snap.cc : '',
        bcc: typeof snap.bcc === 'string' ? snap.bcc : '',
        subject: typeof snap.subject === 'string' ? snap.subject : '',
        bodyHtml: snap.bodyHtml,
      }
    }
  } catch {
    // Plain-text draft: fall through to the body-only shape below.
  }
  return null
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function ComposeHost(props: ComposeHostProps): ReactElement {
  const { accountId, threadKey, initialDraft, onDirtyChange, onSend, readOnly } = props
  const { t } = useI18n()

  const restored =
    initialDraft !== undefined && initialDraft.length > 0 ? parseSnapshot(initialDraft) : null
  const [to, setTo] = useState(restored?.to ?? '')
  const [cc, setCc] = useState(restored?.cc ?? '')
  const [bcc, setBcc] = useState(restored?.bcc ?? '')
  const [subject, setSubject] = useState(restored?.subject ?? '')
  const [bodyHtml, setBodyHtml] = useState(restored?.bodyHtml ?? initialDraft ?? '')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  // The pristine empty compose is clean; restored or typed content is an
  // unsent draft (dirty) until autosaved or sent.
  const [lastSaved, setLastSaved] = useState(EMPTY_SNAPSHOT)
  const [confirmArmed, setConfirmArmed] = useState(false)
  const [rejectNotice, setRejectNotice] = useState(false)

  const draftKey = threadKey ?? 'new'
  const snapshot = JSON.stringify({ to, cc, bcc, subject, bodyHtml })
  const dirty = snapshot !== lastSaved
  const showRestored = restored !== null || (initialDraft !== undefined && initialDraft.length > 0)

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  // Typing disarms the two-step send confirm.
  useEffect(() => {
    setConfirmArmed(false)
  }, [to, cc, bcc, subject, bodyHtml])

  // Draft autosave (debounced); failures keep the tab dirty so the close
  // guard still fires. Drafts hold no secrets — only compose text.
  useEffect(() => {
    if (readOnly === true || accountId.length === 0 || !dirty) return
    const snap = snapshot
    const timer = setTimeout(() => {
      try {
        const pending = window.mailApi.saveDraft(accountId, draftKey, snap)
        pending.then(
          () => setLastSaved(snap),
          () => undefined,
        )
      } catch {
        // Renderer-side save failure: stay dirty, the close guard covers it.
      }
    }, DRAFT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [accountId, draftKey, dirty, snapshot, readOnly])

  const toAddrs = splitAddresses(to)
  const ccAddrs = splitAddresses(cc)
  const bccAddrs = splitAddresses(bcc)
  const text = htmlToText(bodyHtml)
  const addressesValid =
    toAddrs.length > 0 &&
    toAddrs.every((addr) => EMAIL_RE.test(addr)) &&
    ccAddrs.every((addr) => EMAIL_RE.test(addr)) &&
    bccAddrs.every((addr) => EMAIL_RE.test(addr))
  const totalBytes = text.length + attachments.reduce((sum, att) => sum + att.size, 0)
  const canSend =
    readOnly !== true &&
    accountId.length > 0 &&
    addressesValid &&
    subject.length <= MAX_SUBJECT_CHARS &&
    text.length <= MAX_TEXT_CHARS
  const showWarn = totalBytes > WARN_TOTAL_BYTES
  const showDriverHint = attachments.some((att) => att.size > STRICT_DRIVER_FILE_BYTES)

  async function addFiles(files: FileList | File[]): Promise<void> {
    const picked: PendingAttachment[] = []
    let rejected = false
    const room = MAX_ATTACHMENTS - attachments.length
    for (const file of Array.from(files).slice(0, Math.max(room, 0))) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.byteLength > REJECT_FILE_BYTES) {
        rejected = true
        continue
      }
      picked.push({
        key: `${Date.now()}-${picked.length}-${file.name}`,
        filename: file.name,
        mime: file.type !== '' ? file.type : 'application/octet-stream',
        size: bytes.byteLength,
        data: bytes,
      })
    }
    if (rejected) setRejectNotice(true)
    if (picked.length > 0) setAttachments((current) => [...current, ...picked])
  }

  function onAttachChange(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files) void addFiles(event.target.files)
    event.target.value = ''
  }

  function removeAttachment(key: string): void {
    setAttachments((current) => current.filter((att) => att.key !== key))
  }

  function saveNow(): void {
    if (accountId.length === 0) return
    try {
      const snap = snapshot
      const pending = window.mailApi.saveDraft(accountId, draftKey, snap)
      pending.then(
        () => setLastSaved(snap),
        () => undefined,
      )
    } catch {
      // Stay dirty on failure; the close guard covers it.
    }
  }

  async function handleSend(): Promise<void> {
    if (!canSend) return
    if (!confirmArmed) {
      setConfirmArmed(true)
      return
    }
    setConfirmArmed(false)
    const staged: StagedAttachment[] = []
    const bridge = window.mailCompose
    for (const att of attachments) {
      if (bridge) {
        try {
          staged.push(await bridge.stageAttachment(att.filename, att.mime, att.data))
          continue
        } catch {
          // Staging failure falls through to the data-fallback form below;
          // the main process re-stages or rejects with the size caps.
        }
      }
      staged.push({
        filename: att.filename,
        mime: att.mime,
        size: att.size,
        path: `memory:${att.filename}`,
        data: att.data,
      })
    }
    const req: SendRequest = {
      to: toAddrs,
      ...(ccAddrs.length > 0 ? { cc: ccAddrs } : {}),
      ...(bccAddrs.length > 0 ? { bcc: bccAddrs } : {}),
      subject,
      text,
      ...(bodyHtml !== text ? { html: bodyHtml } : {}),
      ...(staged.length > 0 ? { attachments: staged } : {}),
    }
    onSend(req)
    setLastSaved(snapshot)
  }

  return (
    <section className="mail-compose" data-compose-mount="true">
      {showRestored ? (
        <div className="mail-compose-notice" role="status">
          {t('mail.compose.draftRestored')}
        </div>
      ) : null}
      <div className="mail-compose-field">
        <label className="mail-compose-label" htmlFor="mail-compose-to">
          {t('mail.compose.to')}
        </label>
        <input
          id="mail-compose-to"
          className="mail-compose-input"
          value={to}
          disabled={readOnly === true}
          aria-invalid={to.length > 0 && !toAddrs.every((addr) => EMAIL_RE.test(addr))}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>
      <div className="mail-compose-field">
        <label className="mail-compose-label" htmlFor="mail-compose-cc">
          {t('mail.compose.cc')}
        </label>
        <input
          id="mail-compose-cc"
          className="mail-compose-input"
          value={cc}
          disabled={readOnly === true}
          onChange={(event) => setCc(event.target.value)}
        />
      </div>
      <div className="mail-compose-field">
        <label className="mail-compose-label" htmlFor="mail-compose-bcc">
          {t('mail.compose.bcc')}
        </label>
        <input
          id="mail-compose-bcc"
          className="mail-compose-input"
          value={bcc}
          disabled={readOnly === true}
          onChange={(event) => setBcc(event.target.value)}
        />
      </div>
      <div className="mail-compose-field">
        <label className="mail-compose-label" htmlFor="mail-compose-subject">
          {t('mail.compose.subject')}
        </label>
        <input
          id="mail-compose-subject"
          className="mail-compose-input"
          value={subject}
          disabled={readOnly === true}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>
      <div
        className="mail-compose-body"
        contentEditable={readOnly === true ? false : true}
        suppressContentEditableWarning={true}
        data-placeholder={t('mail.compose.body')}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
        onInput={(event) => setBodyHtml(event.currentTarget.innerHTML)}
      />
      {showWarn ? (
        <div className="mail-compose-notice mail-compose-notice--warn" role="status">
          {t('mail.compose.oversizeWarn')}
        </div>
      ) : null}
      {rejectNotice ? (
        <div className="mail-compose-notice mail-compose-notice--error" role="status">
          {t('mail.compose.oversizeReject')}
        </div>
      ) : null}
      {showDriverHint ? (
        <div className="mail-compose-notice" role="status">
          {t('mail.compose.perDriverCap')}
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <ul className="mail-compose-attachments">
          {attachments.map((att) => (
            <li key={att.key} className="mail-compose-attach-row">
              <span className="mail-compose-attach-name">{att.filename}</span>
              {att.size > STRICT_DRIVER_FILE_BYTES ? (
                <span className="mail-compose-attach-hint">{t('mail.compose.perDriverCap')}</span>
              ) : null}
              <button
                type="button"
                className="mail-compose-remove"
                disabled={readOnly === true}
                onClick={() => removeAttachment(att.key)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mail-compose-actions">
        <button
          type="button"
          className="mail-compose-send"
          disabled={!canSend}
          onClick={() => void handleSend()}
        >
          {confirmArmed ? t('mail.compose.sendConfirm') : t('mail.compose.send')}
        </button>
        <button type="button" className="mail-compose-save" onClick={saveNow}>
          {t('mail.compose.saveDraft')}
        </button>
        <label className="mail-compose-attach">
          {t('mail.compose.attachFiles')}
          <input
            type="file"
            multiple={true}
            hidden={true}
            disabled={readOnly === true}
            onChange={onAttachChange}
          />
        </label>
        {dirty ? <span className="mail-compose-dirty">•</span> : null}
      </div>
    </section>
  )
}
