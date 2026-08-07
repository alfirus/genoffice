import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, ProjectApi } from '../shared/ipc'

const desktopApi: DesktopApi = {
  getLanguage: () => ipcRenderer.invoke('app:get-language'),
  open: () => ipcRenderer.invoke('markdown:open'),
  openPath: (p) => ipcRenderer.invoke('markdown:open-path', p),
  consumePendingOpen: () => ipcRenderer.invoke('markdown:consume-pending'),
  save: (data, p) => ipcRenderer.invoke('markdown:save', data, p),
  saveAs: (data) => ipcRenderer.invoke('markdown:save-as', data),
  saveNew: (data) => ipcRenderer.invoke('markdown:save-new', data),
  recent: () => ipcRenderer.invoke('markdown:recent'),
  print: () => ipcRenderer.send('markdown:print'),
  exportPdf: () => ipcRenderer.send('markdown:export-pdf'),
  onMenuCommand: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, cmd: string, payload?: string) =>
      handler(cmd as never, payload)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
  onCloseCheck: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('markdown:close-check', listener)
    return () => ipcRenderer.removeListener('markdown:close-check', listener)
  },
  onCloseSaveRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('markdown:close-save-request', listener)
    return () => ipcRenderer.removeListener('markdown:close-save-request', listener)
  },
  reportCloseCheckResult: (state) => ipcRenderer.send('markdown:close-check-result', state),
  reportCloseSaveResult: (ok) => ipcRenderer.send('markdown:close-save-result', ok),
  onTeardown: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('markdown:teardown', listener)
    return () => ipcRenderer.removeListener('markdown:teardown', listener)
  },
  onLanguageChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, lang: string) => handler(lang)
    ipcRenderer.on('app:language-changed', listener)
    return () => ipcRenderer.removeListener('app:language-changed', listener)
  },
  getTheme: () => ipcRenderer.invoke('home:get-theme'),
  onThemeChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, theme: string) => handler(theme)
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  onDirtyChanged: (dirty) => ipcRenderer.send('markdown:dirty-changed', dirty),
  winNew: async () => {
    ipcRenderer.send('win:new')
  },
  winList: () => ipcRenderer.invoke('win:list'),
  winFocus: (id) => ipcRenderer.send('win:focus', id),
  aiGetSettings: () => ipcRenderer.invoke('ai:get-settings'),
  aiSetSettings: (s) => ipcRenderer.invoke('ai:set-settings', s),
  aiChat: (r) => ipcRenderer.invoke('ai:chat', r),
  aiStream: async (r) => {
    ipcRenderer.send('ai:stream', r)
  },
  aiStreamCancel: async () => {
    ipcRenderer.send('ai:stream-cancel')
  },
  aiStreamChunk: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, chunk: unknown) => handler(chunk as never)
    ipcRenderer.on('ai:stream-chunk', listener)
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener)
  },
  aiGskStatus: () => ipcRenderer.invoke('ai:gsk-status'),
  aiGskLogin: () => ipcRenderer.invoke('ai:gsk-login'),
  aiWebSearch: (q) => ipcRenderer.invoke('ai:web-search', q),
  aiFetchImage: (url) => ipcRenderer.invoke('ai:fetch-image', url),
  webUtils: { getPathForFile: (f: File) => ipcRenderer.sendSync('webUtils:getPathForFile', f) },
}

const projectApi: ProjectApi = {
  resolveChat: (p) => ipcRenderer.invoke('project:resolveChat', p),
  appendChat: (p, m) => ipcRenderer.invoke('project:appendChat', p, m),
  loadChat: (p) => ipcRenderer.invoke('project:loadChat', p),
  rebindChat: (p, c) => ipcRenderer.invoke('project:rebindChat', p, c),
  list: () => ipcRenderer.invoke('project:list'),
  create: (n) => ipcRenderer.invoke('project:create', n),
  rename: (o, n) => ipcRenderer.invoke('project:rename', o, n),
  delete: (p) => ipcRenderer.invoke('project:delete', p),
  moveFile: (f, p) => ipcRenderer.invoke('project:moveFile', f, p),
  timeline: (p) => ipcRenderer.invoke('project:timeline', p),
}

contextBridge.exposeInMainWorld('markdownApi', desktopApi)
contextBridge.exposeInMainWorld('projectApi', projectApi)
