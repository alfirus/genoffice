/**
 * @genoffice/mail-protocols: pure-TS mail protocol layer. No Electron,
 * no native deps. Driver lanes (IMAP/SMTP, Gmail, Graph) add pure-TS
 * MailProvider implementations importing these interfaces.
 */
export type {
  MailFolder,
  MailMessageRef,
  MailFlags,
  MailEnvelope,
  MailBody,
  StagedAttachment,
  SendRequest,
  MailQuery,
  MailEvent,
  MailProvider,
  MailIntent,
  SyncState,
  MailStore,
} from './types'
export {
  parseAddress,
  parseAddressList,
  formatAddress,
  formatAddressList,
  decodeDisplayName,
  toEnvelopeStrings,
  type MailAddress,
} from './addresses'
export {
  parseMimeMessage,
  makeSnippet,
  singleLine,
  stripTags,
  detectRemoteRefs,
  type ParsedMail,
  type ParsedAttachment,
} from './mime'
export {
  OUTGOING_WARN_BYTES,
  INLINE_PREVIEW_CAP_BYTES,
  safeFilename,
  contentAddress,
  checkAttachmentSize,
  stageAttachment,
  type StageInput,
} from './attachments'
export {
  decideSync,
  nextIntent,
  resolveIntentAttempt,
  intentKey,
  type SyncDecision,
  type SyncSignals,
  type IntentAttempt,
  type IntentStep,
  type IntentResolution,
} from './sync'
export {
  GRAPH_MAIL_SCOPES,
  GraphServiceError,
  toGraphError,
  isDeltaExpiredError,
  isAuthFailure,
  isInvalidGrant,
  createGraphTransport,
  type GraphAuthProvider,
  type GraphRequestInit,
  type GraphTransport,
} from './graph-transport'
export {
  GraphDriver,
  GraphDriverError,
  DEFAULT_POLL_INTERVAL_MS as GRAPH_DEFAULT_POLL_INTERVAL_MS,
  MAX_POLL_BACKOFF_MS as GRAPH_MAX_POLL_BACKOFF_MS,
  GRAPH_WARN_TOTAL_BYTES,
  GRAPH_MAX_TOTAL_BYTES,
  GRAPH_MAX_ATTACHMENT_BYTES,
  GRAPH_MAX_RECIPIENTS,
  type GraphDriverErrorCode,
  type GraphSendCaps,
  type GraphDriverConfig,
  type GraphMessage,
  type GraphFolder,
  type DeltaSyncResult,
  type SendSizeVerdict,
} from './graph-driver'
