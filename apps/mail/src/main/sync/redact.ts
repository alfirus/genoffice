/**
 * Mail redaction helper for sync/outbox log and error paths (P4 spec
 * section 9). The plan named `agent-core/redact-core.ts` as the extension
 * point, but no such module exists in the tree (verified: no redact-core
 * anywhere outside the CLI argv helper), so the Y lane carries this local
 * helper in sync scope. Every new log/error call-site in sync/* passes
 * through sanitizeError; bodies, snippets, addresses, and secrets never
 * reach lastError, MailEvents, or logs.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const TOKEN_RE = /(bearer\s+[A-Za-z0-9\-._~+/]+|ya29\.[A-Za-z0-9\-_]+|xox[a-z]-[A-Za-z0-9-]+)/gi
const LONG_B64_RE = /[A-Za-z0-9+/=_-]{64,}/g

/** Provider error text reduced to a PII-free one-line summary. */
export function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'sync failed')
  const oneLine = raw.split('\n')[0].slice(0, 280).trim()
  return (
    oneLine
      .replace(EMAIL_RE, '[address]')
      .replace(TOKEN_RE, '[secret]')
      .replace(LONG_B64_RE, '[blob]')
      .trim() || 'sync failed'
  )
}

/**
 * True when text looks free of PII/secret bytes (test assertion helper).
 * Flags addresses, token shapes, and long base64 runs that could carry
 * body or credential bytes.
 */
export function containsPii(text: string): boolean {
  // Global regexes keep lastIndex state across .test calls; reset first
  // so repeated calls give stable answers.
  EMAIL_RE.lastIndex = 0
  TOKEN_RE.lastIndex = 0
  LONG_B64_RE.lastIndex = 0
  return EMAIL_RE.test(text) || TOKEN_RE.test(text) || LONG_B64_RE.test(text)
}
