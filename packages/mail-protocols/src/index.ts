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
export * from './imap-smtp-driver.js'
export * from './imap-transport.js'
export * from './imap-fakes.js'
export {
  GmailDriver,
  GmailAuthExpiredError,
  GmailSendLimitError,
  GMAIL_MODIFY_SCOPE,
  GMAIL_MAX_MESSAGE_BYTES,
  GMAIL_WARN_BYTES,
  GMAIL_MAX_RECIPIENTS_PER_MESSAGE,
  isHistoryExpiredError,
  isInvalidGrantError,
  mapGmailError,
  countSendRecipients,
  estimateSendBytes,
  checkSendLimits,
  gmailLabelToFolder,
  gmailLabelsToFlags,
  decodeGmailBody,
  extractGmailBody,
  gmailMessageToEnvelope,
  buildGmailQuery,
  buildRawMessage,
  encodeRawMessage,
  parseSentRaw,
  type GmailHeader,
  type GmailPayload,
  type GmailMessage,
  type GmailLabel,
  type GmailAuthProvider,
  type GmailTransport,
  type GmailSyncHooks,
  type GmailRawBody,
  type SendLimitVerdict,
  type RawAttachmentInput,
  type RawMessageInput,
  type GmailDriverOptions,
} from './gmail'
export { createGmailTransport } from './gmail-transport'
