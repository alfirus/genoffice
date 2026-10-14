import { contextBridge, ipcRenderer } from 'electron'
import type { Lang } from '@genoffice/i18n'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { AI_CHANNELS, MAIL_CHANNELS } from '../shared/ipc'
import type { MailApi, UiTheme } from '../shared/ipc'
import type { MailFlags, MailMessageRef, MailQuery, SendRequest } from '@genoffice/mail-protocols'
import { isMailRef } from '../shared/mail-ref'

// Shell-channel bridge (Lane S owns). Generic passthrough: every method
// forwards to its canonical MAIL_CHANNELS entry with no logic beyond a
// hand-rolled shape guard. This file stays zod-free (sheets precedent);
// main-process handlers re-validate with the zod schemas in
// `../shared/ipc-schemas`. Lane C's compose bridge lives separately in
// `compose-bridge.ts` (Lane C owns).

function assertMailRef(ref: string): void {
  if (!isMailRef(ref)) throw new Error('mail: bad mailRef')
}

function assertRef(ref: MailMessageRef): void {
  if (!ref || typeof ref.uid !== 'string' || typeof ref.folderId !== 'string') {
    throw new Error('mail: bad message ref')
  }
}

function assertQuery(query: MailQuery): void {
  if (!query || typeof query !== 'object') throw new Error('mail: bad query')
}

function assertSend(req: SendRequest): void {
  if (
    !req ||
    !Array.isArray(req.to) ||
    typeof req.subject !== 'string' ||
    typeof req.text !== 'string'
  ) {
    throw new Error('mail: bad send request')
  }
}

const api: MailApi = {
  openMessage: (mailRef) => {
    assertMailRef(mailRef)
    return ipcRenderer.invoke(MAIL_CHANNELS.openMessage, { mailRef })
  },
  listAccounts: () => ipcRenderer.invoke(MAIL_CHANNELS.listAccounts),
  addAccount: (label) => ipcRenderer.invoke(MAIL_CHANNELS.addAccount, { label }),
  removeAccount: (accountId) => ipcRenderer.invoke(MAIL_CHANNELS.removeAccount, { accountId }),
  listFolders: (accountId) => ipcRenderer.invoke(MAIL_CHANNELS.listFolders, { accountId }),
  listMessages: (accountId, folderId, limit, cursor) =>
    ipcRenderer.invoke(MAIL_CHANNELS.listMessages, { accountId, folderId, limit, cursor }),
  fetchBody: (ref) => {
    assertRef(ref)
    return ipcRenderer.invoke(MAIL_CHANNELS.fetchBody, { ref })
  },
  searchLocal: (accountIds, query) => {
    assertQuery(query)
    return ipcRenderer.invoke(MAIL_CHANNELS.searchLocal, { accountIds, query })
  },
  searchServer: (accountId, folderId, query) => {
    assertQuery(query)
    return ipcRenderer.invoke(MAIL_CHANNELS.searchServer, { accountId, folderId, query })
  },
  composeSend: (req) => {
    assertSend(req)
    return ipcRenderer.invoke(MAIL_CHANNELS.composeSend, req)
  },
  saveDraft: (accountId, threadKey, text) =>
    ipcRenderer.invoke(MAIL_CHANNELS.saveDraft, { accountId, threadKey, text }),
  outboxStatus: (accountId) => ipcRenderer.invoke(MAIL_CHANNELS.outboxStatus, { accountId }),
  move: (ref, toFolderId, expectedModseq) => {
    assertRef(ref)
    return ipcRenderer.invoke(MAIL_CHANNELS.move, { ref, toFolderId, expectedModseq })
  },
  setFlags: (ref, flags, expectedModseq) => {
    assertRef(ref)
    return ipcRenderer.invoke(MAIL_CHANNELS.flags, { ref, flags, expectedModseq })
  },
  deleteMessage: (ref, expectedModseq) => {
    assertRef(ref)
    return ipcRenderer.invoke(MAIL_CHANNELS.delete, { ref, expectedModseq })
  },
  onSyncEvent: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, event: Parameters<typeof handler>[0]) =>
      handler(event)
    ipcRenderer.on(MAIL_CHANNELS.syncEvents, listener)
    return () => ipcRenderer.removeListener(MAIL_CHANNELS.syncEvents, listener)
  },
  attachmentFetch: (attachmentPath) =>
    ipcRenderer.invoke(MAIL_CHANNELS.attachmentFetch, { attachmentPath }),
  onAttachmentProgress: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, completed: number, total: number) =>
      handler(completed, total)
    ipcRenderer.on(MAIL_CHANNELS.attachmentProgress, listener)
    return () => ipcRenderer.removeListener(MAIL_CHANNELS.attachmentProgress, listener)
  },
  setDirty: (dirty) => ipcRenderer.send(MAIL_CHANNELS.dirtyChanged, dirty),
  onCloseSaveRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(MAIL_CHANNELS.closeSaveRequest, listener)
    return () => ipcRenderer.removeListener(MAIL_CHANNELS.closeSaveRequest, listener)
  },
  sendCloseSaveResult: (ok) => ipcRenderer.send(MAIL_CHANNELS.closeSaveResult, ok),
  getLanguage: () => ipcRenderer.invoke(MAIL_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, lang: Lang) => handler(lang)
    ipcRenderer.on(MAIL_CHANNELS.languageChanged, listener)
    return () => ipcRenderer.removeListener(MAIL_CHANNELS.languageChanged, listener)
  },
  getTheme: () => ipcRenderer.invoke(MAIL_CHANNELS.getTheme),
  onThemeChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on(MAIL_CHANNELS.themeChanged, listener)
    return () => ipcRenderer.removeListener(MAIL_CHANNELS.themeChanged, listener)
  },
  getAiPanelPrefs: () => ipcRenderer.invoke('app:get-ai-panel-prefs'),
  onAiPanelPrefsChanged: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, prefs: Parameters<typeof handler>[0]) =>
      handler(prefs)
    ipcRenderer.on('app:ai-panel-prefs-changed', listener)
    return () => ipcRenderer.removeListener('app:ai-panel-prefs-changed', listener)
  },
  onChromePressed: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('app:chrome-pressed', listener)
    return () => ipcRenderer.removeListener('app:chrome-pressed', listener)
  },
  getAiSettings: () => ipcRenderer.invoke(AI_CHANNELS.getSettings),
  aiGskStatus: () => ipcRenderer.invoke(AI_CHANNELS.gskStatus),
  aiStream: (request) => ipcRenderer.invoke(AI_CHANNELS.stream, request),
  aiStreamCancel: (requestId) => ipcRenderer.invoke(AI_CHANNELS.streamCancel, requestId),
  onAiStream: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on(AI_CHANNELS.streamChunk, listener)
    return () => ipcRenderer.removeListener(AI_CHANNELS.streamChunk, listener)
  },
}

contextBridge.exposeInMainWorld('mailApi', api)

export type { MailApi }
export type { MailFlags }
