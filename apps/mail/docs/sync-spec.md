# GenOffice Mail P4 — Sync + Offline Spec (locked)

Lane: SPEC (Tech Lead). Base: `34d0a468` on `feat/mail-p3-merge`.
Branch: `feat/mail-p4-sync-spec` (local-only; fakes only, no real creds).
Plan basis: `genoffice-mail-plan.md` sections 2.2, 2.3, 2.4.

Build lanes (T/store, Y/drivers, O/outbox-UI) carry the decisions below
verbatim. Any change ships as a `SPEC-DELTA` amendment — never a silent edit.

Related locked code this spec builds on (do not re-decide):

- `packages/mail-protocols/src/types.ts` — `MailEnvelope`, `MailIntent`,
  `SyncState`, `SendRequest`, path-canonical `StagedAttachment`.
- `packages/mail-protocols/src/sync.ts` — `decideSync`, `nextIntent`,
  `resolveIntentAttempt`, `intentKey` (pure, already tested).
- `packages/mail-protocols/src/attachments.ts` — `OUTGOING_WARN_BYTES`
  (25 MB), `INLINE_PREVIEW_CAP_BYTES` (50 MB), `stageAttachment`.
- `apps/mail/src/main/mail-store.ts` — `InMemoryMailStore` P3 stub that the
  T lane replaces with the SQLite engine behind the same `MailStore` shape.
- `apps/mail/src/shared/ipc.ts` (`MAIL_CHANNELS`), `compose-channels.ts`
  (`COMPOSE_CHANNELS`), zod schemas in `ipc-schemas.ts` / `compose-schemas.ts`.

---

## 0. SPEC-DELTA corrections to the plan (read first)

### SPEC-DELTA-1 — no existing SQLite driver exists to reuse

The plan (2.2) says to reuse "the same SQLite access layer the shell
file-index already uses". Verified against the base tree: there is no
SQLite anywhere in the repo — no `better-sqlite3`, no `node:sqlite`, no
`sql.js`, no `file-index/` directory, no FTS tokenizer. The shell's
recents/home search is `statSync`-over-JSON (`apps/shell/src/main/`
`recent-files.ts`, `packages/project-store` JSON store). The "shell
file-index SQLite FTS" precedent does not exist; do not go looking for it.

Locked verdict:

- REJECTED `better-sqlite3`: ships `binding.gyp` native code, needs
  `electron-rebuild` on every Electron bump, and violates the plan's own
  native-module rule (2.1, "reject any dep with `binding.gyp` at review").
- MANDATED `node:sqlite`: Node-bundled (engines demand `node >= 22.12.0`,
  shell runs Electron 43 / Node 22), zero new prod deps, license-gate
  neutral, no rebuild step. Exactly one wrapper module owns it
  (section 1.4); no other file imports `node:sqlite` directly
  (enforced by eslint no-restricted-imports in the T lane).
- Escape hatch only: if the Y lane proves `node:sqlite` unavailable inside
  the pinned Electron 43 sandbox at build start, it stops and files
  SPEC-DELTA-2 for Tech Lead sign-off (license gate + rebuildtoolchain).
  No lane adds a SQLite dep unilaterally.

### SPEC-DELTA-2 — no shared FTS tokenizer exists either

Same finding covers the plan's "reusing the file-index tokenizer (CJK
included)". The T lane implements FTS inside the new store with SQLite
FTS5 (`unicode61`; CJK bigram handling documented in section 1.3) and
owns that tokenizer. No dependency on shell code.

---

## 1. SQLite schema (T lane builds, Y lane imports, nobody else touches)

### 1.1 Files and module ownership

- Per-profile directory `~/.genoffice/mail/` (resolve via the shell's
  existing app-data path helper; no new location logic):
  - `<account-id>.sqlite` — envelopes, folders, sync state, outbox,
    drafts, intents. One file per account so account removal is one
    `rm` and no cross-account query can leak rows.
  - `blobs/<sha256[0:2]>/<sha256>.html` — content-addressed full HTML.
  - `attachments/<sha256[0:2]>/<sha256>-<safeFilename>` — stored payloads.
  - `staging/<uuid>-<safeFilename>` — temp landing (quarantine gate).
- Single access layer: `apps/mail/src/main/store/sqlite.ts` (new, T owns).
  Only file that imports `node:sqlite`. Migrations live in
  `apps/mail/src/main/store/migrations.ts` (`PRAGMA user_version`,
  forward-only, each migration in one transaction).

### 1.2 DDL (authoritative; T lane applies verbatim)

```sql
CREATE TABLE accounts (
  accountId   TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('imap','gmail','graph')),
  sessionOnly INTEGER NOT NULL DEFAULT 0,   -- 1: secret memory-only, never persisted
  credRef     TEXT,                          -- opaque safeStorage vault handle, NEVER a secret
  createdAt   TEXT NOT NULL
) STRICT;

CREATE TABLE folders (
  accountId TEXT NOT NULL REFERENCES accounts(accountId) ON DELETE CASCADE,
  folderId  TEXT NOT NULL,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL CHECK (role IN
              ('inbox','sent','drafts','trash','spam','archive','custom')),
  unread    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (accountId, folderId)
) STRICT;

CREATE TABLE messages (
  accountId TEXT NOT NULL,
  folderId  TEXT NOT NULL,
  uid       TEXT NOT NULL,                   -- IMAP UID / Gmail id / Graph id
  msgId     TEXT,                            -- RFC Message-ID header (nullable: not all mail carries one)
  threadId  TEXT NOT NULL,
  fromJson  TEXT NOT NULL,                   -- JSON string[] of addresses
  toJson    TEXT NOT NULL,
  ccJson    TEXT NOT NULL DEFAULT '[]',
  subject   TEXT NOT NULL DEFAULT '',
  dateIso   TEXT NOT NULL,
  seen      INTEGER NOT NULL DEFAULT 0,
  flagged   INTEGER NOT NULL DEFAULT 0,
  answered  INTEGER NOT NULL DEFAULT 0,
  draft     INTEGER NOT NULL DEFAULT 0,
  labelsJson TEXT NOT NULL DEFAULT '[]',     -- Gmail labels / Graph categories
  snippet   TEXT NOT NULL DEFAULT '',        -- short preview, inline (section 2)
  bodyText  TEXT NOT NULL DEFAULT '',        -- plaintext, inline (section 2)
  bodyHtmlRef TEXT,                          -- relative blob path or NULL (never inline HTML)
  hasAttach INTEGER NOT NULL DEFAULT 0,
  modseq    TEXT,                            -- CONDSTORE modseq / Gmail historyId-at-fetch / Graph cTag
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (accountId, folderId, uid),
  FOREIGN KEY (accountId, folderId) REFERENCES folders(accountId, folderId) ON DELETE CASCADE
) STRICT;

CREATE VIRTUAL TABLE messages_fts USING fts5(
  subject, fromText, snippet, bodyText,
  content='messages', content_rowid='rowid',
  tokenize='unicode61 "remove_diacritics=2"'
);

CREATE TABLE attachments (
  accountId  TEXT NOT NULL,
  msgUid     TEXT NOT NULL,
  contentId  TEXT,                           -- MIME Content-ID or NULL
  filename   TEXT NOT NULL,                  -- already passed through safeFilename
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  blobPath   TEXT NOT NULL,                  -- relative store path; temp staging path while state='staged'
  state      TEXT NOT NULL DEFAULT 'stored'
             CHECK (state IN ('staged','quarantined','stored')),
  PRIMARY KEY (accountId, msgUid, filename)
) STRICT;

CREATE TABLE sync_state (
  accountId     TEXT NOT NULL,
  folderId      TEXT NOT NULL,
  uidValidity   INTEGER,                     -- IMAP only
  highestModseq TEXT,                        -- IMAP CONDSTORE only
  historyId     TEXT,                        -- Gmail only
  deltaToken    TEXT,                        -- Graph only
  lastSyncAt    TEXT NOT NULL,
  PRIMARY KEY (accountId, folderId)
) STRICT;

CREATE TABLE outbox (
  id          TEXT PRIMARY KEY,              -- outbox-<n> / uuid, stable for idempotent retry
  accountId   TEXT NOT NULL REFERENCES accounts(accountId) ON DELETE CASCADE,
  reqJson     TEXT NOT NULL,                 -- path-canonical SendRequest (section 5); blobs never inline
  state       TEXT NOT NULL DEFAULT 'queued'
              CHECK (state IN ('queued','sending','failed','sent','cancelled')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  nextRetryAt TEXT,                          -- ISO; NULL when no retry scheduled
  lastError   TEXT,                          -- sanitized provider text, never secrets/PII beyond subject-free summary
  queuedAt    TEXT NOT NULL,
  sentAt      TEXT
) STRICT;

CREATE TABLE drafts (
  accountId TEXT NOT NULL,
  threadKey TEXT NOT NULL,
  text      TEXT NOT NULL DEFAULT '',
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (accountId, threadKey)
) STRICT;

CREATE TABLE intents (                        -- offline move/flag/delete/label queue (section 4)
  id             TEXT PRIMARY KEY,
  accountId      TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('move','flag','delete','label')),
  targetUid      TEXT NOT NULL,
  folderId       TEXT NOT NULL,
  expectedModseq TEXT,                        -- NULL when the driver has no modseq concept
  payloadJson    TEXT NOT NULL,
  state          TEXT NOT NULL DEFAULT 'queued'
                 CHECK (state IN ('queued','acked','failed')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  createdAt      TEXT NOT NULL
) STRICT;
```

Index set (T lane, same migration): `messages(threadId)`,
`messages(accountId, dateIso DESC)`, `outbox(accountId, state)`,
`intents(accountId, state)`.

### 1.3 FTS rules

- `messages_fts` mirrors `(subject, from, snippet, bodyText)` only.
  `bodyHtmlRef` targets and attachment contents are never indexed.
- Triggers (`AFTER INSERT/UPDATE/DELETE`) keep the FTS table in sync;
  full resync rebuilds it (`rebuild` command inside the resync txn).
- CJK: `unicode61` treats CJK runs as single tokens; T-lane tests pin
  retrieval for a CJK subject query. No external tokenizer dep.

### 1.4 Access-layer contract (what Y imports, what Y never does)

- `apps/mail/src/main/store/sqlite.ts` exports `openAccountDb(accountId)`,
  `closeAccountDb(accountId)`, `runMigrations(db)`, and the typed row
  helpers implementing the `MailStore` interface from
  `packages/mail-protocols/src/types.ts`. Y imports these helpers only.
- Write discipline: WAL mode, `busy_timeout = 5000`, one-writer via the
  existing main-process handler queue (no worker threads in P4).
- The P3 `InMemoryMailStore` (`apps/mail/src/main/mail-store.ts`) stays
  for vitest; prod handlers resolve the SQLite store behind the same
  `getMailStore()` accessor. T lane owns that cutover.

---

## 2. Storage rules (locked)

1. Plaintext + snippet inline in `messages` (`bodyText`, `snippet`).
   Snippet = first ~280 chars of de-HTMLed text, generated main-side.
2. Full HTML content-addressed on disk: `contentAddress(bytes)` from
   `packages/mail-protocols/src/attachments.ts` (sha256 hex);
   `bodyHtmlRef` stores the relative blob path. Renderer loads HTML
   through `mail:fetch-body` into the existing quarantined reader layer
   (remote images blocked by default — P2 rule, unchanged).
3. Attachments stream to disk only: `staging/` temp landing, then the
   P5-owned quarantine scan promotes `staged -> quarantined -> stored`.
   P4 never executes or previews unscanned payloads; executables are
   never inline. Full blobs never enter SQLite (neither `messages` nor
   `attachments` carries a BLOB column by design).
4. Filenames pass through `safeFilename` at stage time (locked
   `attachments.ts` helper); size verdicts via `checkAttachmentSize`.
5. `snippet`/`bodyText` cap: bodies over 1 MB store the first 1 MB inline
   plus `bodyTruncated=1` semantics in `updatedAt`-adjacent metadata
   (T lane: add the column only if needed — allowed T-local addition,
   report in lane metadata).

---

## 3. Sync semantics per driver (Y lane builds against `decideSync`)

All drivers run main-process only and emit the canonical `MailEvent`
union (`packages/mail-protocols/src/types.ts`) over `mail:sync-events`.
Payloads carry refs and flags only — never bodies or secrets.

### 3.1 IMAP (`ImapSmtpDriver`)

- `UIDVALIDITY`-guarded: compare server `UIDVALIDITY` with
  `sync_state.uidValidity` every sync. Mismatch = full folder re-fetch
  via `decideSync({stored, remoteUidValidity})` ->
  `{kind:'full-resync', reason:'uidvalidity-changed'}`; emit
  `MailEvent {kind:'resync', reason:'uidvalidity-changed'}`; purge folder
  rows inside the resync transaction (outbox/drafts/intents preserved).
- Incremental: `CONDSTORE`/`MODSEQ` (`SELECT ... CONDSTORE`, `FETCH ...
  CHANGEDSINCE`) where advertised, persist `highestModseq`; else
  UID-range fetch from last-seen UID.
- Push: `IDLE` where advertised; else 30 s poll, errors back off
  (x2 with jitter, ceiling 10 min). Backoff resets on success.

### 3.2 Gmail (`GmailDriver`, helpers in `gmail.ts`)

- Incremental `users.history.list` from stored `historyId`; persist the
  returned `historyId` after every successful page.
- Expired `historyId` (HTTP 404, `isHistoryExpired`) -> `decideSync`
  `{kind:'full-resync', reason:'history-expired'}` -> full re-list +
  fresh `historyId` persist (`fullResync('history-expired')` pattern
  already in `gmail.ts`).
- Poll `history.list` every 30-60 s (no Pub/Sub infra in P4). Send caps:
  35 MB encoded (`GMAIL_MAX_MESSAGE_BYTES`), 500 recipients
  (`GMAIL_MAX_RECIPIENTS_PER_MESSAGE`).

### 3.3 Graph (`GraphDriver`)

- Incremental via delta links (`GET .../delta`, persist `deltaToken`
  into `sync_state.deltaToken` after each page). Rejected/expired delta
  -> full re-list (`decideSync` `delta-expired`).
- Poll the delta link every 30-60 s (no webhook infra in P4). Send caps:
  4 MB total (`GRAPH_MAX_TOTAL_BYTES`), 3 MB per attachment
  (`GRAPH_MAX_ATTACHMENT_BYTES`), 500 recipients
  (`GRAPH_MAX_RECIPIENTS`), warn at 3 MB (`GRAPH_WARN_TOTAL_BYTES`).
- IMAP/SMTP generic caps stay: 50 MB total / 25 MB per attachment /
  100 recipients (`MAX_TOTAL_BYTES`, `MAX_ATTACHMENT_BYTES`,
  `MAX_RECIPIENTS`).

### 3.4 Common rules

- Resync never deletes queued outbox rows, drafts, or queued intents
  (`sync.ts` header contract — Y-lane tests pin this).
- `lastSyncAt` updates only after a fully applied page (no partial-mark).
- Offline detection: socket/auth failure or `navigator`-level offline
  from the shell flips `offline-status` (section 6); drivers pause
  timers and queue instead of throwing to the renderer.

---

## 4. Conflict rule (locked, no exceptions)

- Server wins for flags, labels, and moves.
- Client wins ONLY for queued outbox sends and local draft text.
- Offline moves/flags/deletes/labels queue as `intents` rows, replayed
  FIFO on reconnect, each idempotent via
  `intentKey(accountId, targetUid, expectedModseq)` (`sync.ts`).
- Replay per intent: attempt -> `acked` (done) | `stale-modseq`
  (re-fetch once, retry once) | second stale or transport failure ->
  `failed` + `MailEvent {kind:'conflict', ...}` surfacing
  (`resolveIntentAttempt` / `nextIntent` — Y lane reuses, never rewrites).
- A failed intent never silently merges; the UI shows server state plus
  the conflict notice (O lane renders, Y supplies the event).

---

## 5. Outbox replay contract (Y builds, O renders)

### 5.1 Queue shape (extends the P3 stub, which had `queued | failed` only)

```ts
interface OutboxRecord {
  id: string            // stable across retries; doubles as the idempotency key
  accountId: string
  req: SendRequest      // path-canonical StagedAttachment (M1 stageDir confinement, unchanged)
  state: 'queued' | 'sending' | 'failed' | 'sent' | 'cancelled'
  attempts: number
  nextRetryAt?: string  // ISO, set while a retry is scheduled
  lastError?: string    // sanitized, no secrets
  queuedAt: string
  sentAt?: string
}
```

O-lane UI states it may rely on: exactly the five `state` values above.
`sending` is transient (one in-flight send per account); `sent` rows are
kept 7 days for "Sent" confirmation then pruned; `cancelled` rows are
kept until the user dismisses them.

### 5.2 Send ordering

- FIFO per account (`queuedAt`, then `id`). One in-flight send per
  account; cross-account sends run concurrently.
- On reconnect: drain outbox sends first, then replay queued intents
  (section 4). A `cancelled` entry is never sent, even mid-retry.
- Double-delivery safety: the driver sends with the outbox `id` as the
  idempotency key (SMTP: `Message-ID: <outbox-<id>@genoffice.local>`;
  Gmail/Graph: client-side dedupe check-then-send inside one DB
  transaction marking `sending`). Crash between send and mark resolves
  to at-most-once via the Sent-folder reconcile on next sync (Y-lane
  test pins this).

### 5.3 Retry / backoff

- Automatic: 5 s, 30 s, 2 min, 10 min (exponential with jitter), max 5
  attempts, then `failed`. `nextRetryAt` drives a single main-process
  timer per account (no renderer timers).
- Manual `mail:outbox-retry` resets `attempts` and re-queues at head.
- Per-driver caps enforced twice: at enqueue (fast reject with the
  P1/C-lane messages) and at send (driver `checkSendCapsOrThrow` wins
  if caps changed between queue and reconnect).

### 5.4 Failure surfacing (O lane consumes)

- `mail:outbox-status` returns `{queued, failed}` (existing shape).
- `mail:outbox-list` returns `OutboxRecord[]` newest-first (capped 200).
- Every transition emits `MailEvent {kind:'sync-state', state, detail}`
  on `mail:sync-events` with `detail` carrying the sanitized error.
- `lastError` text is sanitized main-side: provider message only, redact
  helper applied (section 9), subjects/addresses never included.

---

## 6. MAIL_CHANNELS IPC additions (Y appends ONE block, section 8)

Canonical names (locked). Request/response payloads are zod-validated
end-to-end (sheets precedent: constants in `ipc.ts`, schemas in
`ipc-schemas.ts`, preload stays zod-free with hand-rolled guards).

| Channel | Direction | Payload schema (zod, strict) |
|---|---|---|
| `mail:sync-now` | invoke | req `{accountId: string(1..256), folderId?: string(1..256)}` -> res `{started: boolean}` (debounced: `false` when a sync for that scope is already running) |
| `mail:outbox-list` | invoke | req `{accountId}` -> res `OutboxRecord[]` (max 200, newest-first) |
| `mail:outbox-retry` | invoke | req `{accountId, outboxId: string(1..256)}` -> res `{outboxId, state: 'queued'}` |
| `mail:outbox-cancel` | invoke | req `{accountId, outboxId}` -> res `{cancelled: boolean}` (`false` when already `sent`/`sending`) |
| `mail:offline-status` | event (main->renderer, subscribe) | `{online: boolean, accountId?: string, detail?: string}` — renderer subscribes via `onOfflineStatus(handler): Unsub`; replayed current value on subscribe |

Compat note: `mail:compose-outbox-list` (`COMPOSE_CHANNELS.outboxList`)
stays as a thin forwarder to `mail:outbox-list` through P4; O lane calls
the canonical name for all new UI. Removal lands in P5, not here.

Preload: `window.mailApi` gains `syncNow`, `outboxList`, `outboxRetry`,
`outboxCancel`, `onOfflineStatus` (Y lane, hand-rolled guards mirroring
`mail-bridge.ts` style). No other bridge file changes.

---

## 7. Test plan (scripted fixtures; fakes only, no real creds)

Location: `apps/mail/tests/sync-*.test.ts` (Y) and
`apps/mail/tests/store-*.test.ts` (T); O-lane UI tests use the fakes,
never the drivers. Each case below is a named test the lane reports:

1. `uidvalidity-change-resync`: fake IMAP reports new `UIDVALIDITY`;
   assert full re-fetch, folder rows replaced, `resync` event with
   `reason:'uidvalidity-changed'`, outbox/drafts/intents intact.
2. `history-expiry-resync`: fake Gmail answers 404 to `history.list`;
   assert `fullResync('history-expired')`, fresh `historyId` persisted,
   `resync` event emitted.
3. `delta-expiry-resync`: fake Graph rejects the delta link; assert
   full re-list and new `deltaToken` persisted.
4. `offline-compose-reconnect-send`: go offline, compose-send (queued),
   assert `queued` state + `offline-status {online:false}`; reconnect,
   assert FIFO send, `sent` state, Sent reconcile marks at-most-once.
5. `flag-move-conflict-server-wins`: server flag changed while an
   offline flag intent was queued; assert intent ends `failed` with a
   `conflict` event and the UI-visible state equals server state.
6. `idempotent-replay-double-delivery-safe`: crash-simulate between
   send and mark (fake transport records sends); assert exactly one
   server-side message after reconnect + reconcile.
7. `poll-backoff-schedule`: fake timer asserts 30 s base, x2 backoff to
   the 10 min ceiling, reset on success (all three drivers).
8. `outbox-cap-enforcement`: over-cap send rejected at enqueue AND at
   send with per-driver messages (IMAP 50 MB, Gmail 35 MB, Graph 4 MB).
9. `fts-mirror-and-rebuild`: insert/update/delete keeps `messages_fts`
   in sync; full resync rebuilds; CJK subject query retrieves.
10. `pii-redaction`: sync-error and outbox-failure paths assert no
    body/snippet/secret bytes in `lastError`, events, or logs (Alya
    signs the assertion list).

---

## 8. File-ownership lock (collision-free; no shared-file edits)

| Lane | Owns (write) | May import (read-only) |
|---|---|---|
| T/store | `apps/mail/src/main/store/*`, `apps/mail/tests/store-*.test.ts`, `apps/mail/docs/sync-spec.md` amendments via SPEC-DELTA only | `packages/mail-protocols` types |
| Y/drivers | `apps/mail/src/main/sync/*`, `apps/mail/tests/sync-*.test.ts`, preload `sync` bridge additions, the ONE appended `MAIL_CHANNELS` block in `apps/mail/src/shared/ipc.ts` + matching `ipc-schemas.ts` additions | T's `store/*` API (never edits it) |
| O/outbox-UI | `apps/mail/src/renderer/components/Outbox*`, co-located styles, O-lane tests; theme tokens only (`tools/check-theme-colors.mjs` enforced) | Canonical `mail:outbox-list` / `mail:outbox-status` shapes |

Rules:

- Shared `ipc.ts` channel constants: Y appends ONLY the five section-6
  names in one marked block (`// P4 sync/outbox additions (Y owns)`).
  No other lane touches `ipc.ts`. T/O needing a channel files a
  SPEC-DELTA instead of editing.
- Preload bridge additions belong to Y (`mail-bridge.ts` sync methods
  only; `compose-bridge.ts` untouched except the compat forwarder).
- `mail-store.ts` (`getMailStore` accessor + stub): T owns the cutover.
- English-only comments (`check-english-comments` gate); no new prod
  deps in any lane (license allowlist gate); local-dev only.

---

## 9. Security boundaries (Alya lane verifies; all lanes obey)

1. Secrets: refresh tokens / app passwords live ONLY in
   `safeStorage.encryptString` blobs referenced by opaque `credRef`
   handles. Never plaintext, never `project-store` JSON, never SQLite,
   never logs. Access tokens memory-only.
2. Linux headless (no libsecret/gnome-keyring): prompt-every-launch +
   explicit UX warning; `sessionOnly` account mode keeps the secret in
   memory and never persists. No silent plaintext fallback, ever.
3. PII exclusion: bodies, snippets, attachments, and addresses excluded
   from logs, telemetry, and crash reports. `sync_state`, `MailEvent`,
   `OutboxRecord.lastError` carry refs/counts only.
4. Redact helper: extend `agent-core/redact-core.ts` for mail headers;
   every new log/error call-site in T/Y/O passes through it (Alya lists
   the call-sites at review; test 10 pins the behavior).
5. Renderer never sees secrets, full HTML only via the quarantined
   reader path, staged attachment paths never leak to the renderer
   (opaque staged ids; M1 `stageDir` confinement unchanged).
6. OAuth: system-browser PKCE flow only (Gmail `gmail.modify`,
   Graph `Mail.ReadWrite` + `offline_access`); no embedded-webview auth.

---

## 10. Discipline restated (gates that fail the lane)

- `npm run licenses` + `notices` green before any upstream PR; any new
  transitive dep outside the allowlist fails the phase (replace, never
  exception-request).
- Theme-token rule for O (section 8); English-only comments everywhere.
- Local-dev only: fakes in tests, no real accounts/creds in tree.
