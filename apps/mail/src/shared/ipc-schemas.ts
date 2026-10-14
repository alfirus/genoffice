import { z } from 'zod'

import { isMailRef } from './mail-ref'

/**
 * Zod schemas for every MAIL_CHANNELS payload (sheets `desktop-api.ts`
 * precedent: `z.object({...}).strict()` throughout). Main-process handlers
 * validate with these; the preload keeps a hand-rolled validator and stays
 * zod-free. Lane R/C consume, never edit (Lane S owns).
 */

const accountIdSchema = z.string().min(1).max(256)

const uidSchema = z.string().min(1).max(1024)

/** `mail://<accountId>/<uid>` pseudo-target (locked D3). */
export const mailRefSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => isMailRef(value), { message: 'mail: bad mailRef' })

export const mailOpenMessageSchema = z.object({ mailRef: mailRefSchema }).strict()

export const mailMessageRefSchema = z
  .object({
    uid: uidSchema,
    folderId: z.string().min(1).max(256),
    msgIdHeader: z.string().max(1024).optional(),
    threadId: z.string().min(1).max(256),
  })
  .strict()

export const mailFlagsSchema = z
  .object({
    seen: z.boolean(),
    flagged: z.boolean(),
    answered: z.boolean(),
    draft: z.boolean(),
  })
  .strict()

/** Full 10-field MailQuery (canonical P1 shape, types.ts). */
export const mailQuerySchema = z
  .object({
    text: z.string().max(1024).optional(),
    from: z.string().max(256).optional(),
    to: z.string().max(256).optional(),
    subject: z.string().max(512).optional(),
    seen: z.boolean().optional(),
    flagged: z.boolean().optional(),
    hasAttach: z.boolean().optional(),
    since: z.string().max(64).optional(),
    before: z.string().max(64).optional(),
    onlyUnread: z.boolean().optional(),
  })
  .strict()

/** Path-canonical staged attachment (`data?` fallback only, types.ts). */
export const stagedAttachmentSchema = z
  .object({
    filename: z.string().min(1).max(256),
    mime: z.string().min(1).max(128),
    size: z.number().int().nonnegative(),
    path: z.string().min(1).max(4096),
    data: z.instanceof(Uint8Array).optional(),
  })
  .strict()

export const sendRequestSchema = z
  .object({
    to: z.array(z.string().min(1).max(512)).min(1).max(100),
    cc: z.array(z.string().min(1).max(512)).max(100).optional(),
    bcc: z.array(z.string().min(1).max(512)).max(100).optional(),
    subject: z.string().max(1024),
    text: z.string().max(5_000_000),
    html: z.string().max(10_000_000).optional(),
    attachments: z.array(stagedAttachmentSchema).max(50).optional(),
  })
  .strict()

export const mailEventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('messages-added'),
      accountId: accountIdSchema,
      folderId: z.string().min(1).max(256),
      refs: z.array(mailMessageRefSchema).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal('flags-changed'),
      accountId: accountIdSchema,
      ref: mailMessageRefSchema,
      flags: mailFlagsSchema.partial(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('message-moved'),
      accountId: accountIdSchema,
      ref: mailMessageRefSchema,
      toFolderId: z.string().min(1).max(256),
    })
    .strict(),
  z
    .object({
      kind: z.literal('message-deleted'),
      accountId: accountIdSchema,
      ref: mailMessageRefSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('sync-state'),
      accountId: accountIdSchema,
      folderId: z.string().min(1).max(256),
      state: z.enum(['syncing', 'idle', 'error']),
      detail: z.string().max(1024).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('resync'),
      accountId: accountIdSchema,
      folderId: z.string().min(1).max(256),
      reason: z.enum(['uidvalidity-changed', 'modseq-expired', 'manual']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      accountId: accountIdSchema,
      folderId: z.string().min(1).max(256),
      uid: uidSchema,
      detail: z.string().max(1024),
    })
    .strict(),
])

/** Idempotent offline intents (targetUid + expectedModseq). */
export const mailIntentSchema = z
  .object({
    accountId: accountIdSchema,
    kind: z.enum(['move', 'flag', 'delete', 'label']),
    targetUid: uidSchema,
    expectedModseq: z.string().max(128).optional(),
    payloadJson: z.string().max(100_000),
  })
  .strict()

export const mailListMessagesSchema = z
  .object({
    accountId: accountIdSchema,
    folderId: z.string().min(1).max(256),
    limit: z.number().int().min(1).max(500),
    cursor: z.string().max(1024).optional(),
  })
  .strict()

export const mailSearchLocalSchema = z
  .object({
    accountIds: z.array(accountIdSchema).min(1).max(50),
    query: mailQuerySchema,
  })
  .strict()

export const mailSearchServerSchema = z
  .object({
    accountId: accountIdSchema,
    folderId: z.string().min(1).max(256),
    query: mailQuerySchema,
  })
  .strict()

export const mailMoveSchema = z
  .object({
    ref: mailMessageRefSchema,
    toFolderId: z.string().min(1).max(256),
    expectedModseq: z.string().max(128).optional(),
  })
  .strict()

export const mailFlagsChangeSchema = z
  .object({
    ref: mailMessageRefSchema,
    flags: mailFlagsSchema.partial(),
    expectedModseq: z.string().max(128).optional(),
  })
  .strict()

export const mailDeleteSchema = z
  .object({
    ref: mailMessageRefSchema,
    expectedModseq: z.string().max(128).optional(),
  })
  .strict()

export const mailSaveDraftSchema = z
  .object({
    accountId: accountIdSchema,
    threadKey: z.string().min(1).max(512),
    text: z.string().max(5_000_000),
  })
  .strict()

export const mailAttachmentFetchSchema = z
  .object({ attachmentPath: z.string().min(1).max(4096) })
  .strict()

export type MailOpenMessage = z.infer<typeof mailOpenMessageSchema>
export type MailQueryWire = z.infer<typeof mailQuerySchema>
export type SendRequestWire = z.infer<typeof sendRequestSchema>
export type MailEventWire = z.infer<typeof mailEventSchema>
