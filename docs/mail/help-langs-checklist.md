# Mail help-langs gate checklist (P4)

Gate checklist for the O lane: every user-visible Mail string that P4 sync
adds must keep the mail domain strings table in parity before merge.
Background procedure (single-file `strings.ts`, zh defines the key set) is
the P1 i18n rule; this page is only the per-PR gate.

## Parity rule

- Mail strings live in exactly one file:
  `apps/mail/src/renderer/i18n/strings.ts`.
- `zh` defines the key set; every other locale carries exactly the same keys
  with no empty values (pinned by `apps/mail/tests/mail-strings.test.ts`).
- Non-zh/en locales share the `en` table until their prefix is filled.

## P4 key inventory (O lane fills values, docs tracks parity)

The O lane adds Outbox and offline/sync user strings under these keys.
`zh` first, then identical key sets everywhere else:

- `mail.compose.outboxQueued` (exists) — queued-in-outbox confirmation.
- `mail.compose.outboxFailed` (exists) — queued send failed.
- `mail.errors.syncError` (exists) — sync failed; will retry.
- `mail.errors.resyncNotice` (exists) — mailbox resynced from the server.
- `mail.errors.conflictNotice` (exists) — a change conflicted; review it.
- New P4 keys, only if the O lane's UI needs them beyond the five above:
  outbox `sending` transient label, outbox `cancelled` label, manual-retry
  button, dismiss-cancelled button, offline indicator text, per-driver cap
  message (`mail.compose.perDriverCap`, `mail.compose.oversizeReject` exist —
  prefer reuse over new keys).

## Pre-merge gate

1. `mail-strings.test.ts` green: every locale has exactly the `zh` key set,
   no empty values, frozen inventory keys present.
2. No new key without a `zh` value plus identical `en` value in the same PR.
3. Reused existing keys where the meaning matches (cap, outbox, error keys
   above) instead of minting near-duplicates.
4. English-only comments and strings in the diff.
5. O lane reports the final key list in its lane metadata; docs updates this
   page if keys were added.
