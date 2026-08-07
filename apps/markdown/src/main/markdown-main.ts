import { app, BrowserWindow, dialog, Menu, ipcMain, WebContentsView } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { OpenFileResult } from '../shared/ipc'

// ── Runtime config ───────────────────────────────────────────────────────────

interface MarkdownRuntimeConfig {
  preloadPath: string
  rendererUrl?: string
  rendererFile: string
}

let runtime: MarkdownRuntimeConfig = {
  preloadPath: join(__dirname, '../preload/index.js'),
  rendererUrl: process.env.ELECTRON_RENDERER_URL,
  rendererFile: join(__dirname, '../renderer/index.html'),
}

export function configureMarkdownRuntime(config: MarkdownRuntimeConfig): void {
  runtime = config
  pendingOpenPath = null
}

// ── State ────────────────────────────────────────────────────────────────────

const dirtyByWc = new Set<number>()
const pendingOpenPaths = new Map<number, string>()
let pendingOpenPath: string | null = null

export function markdownIsDirty(webContentsId: number): boolean {
  return dirtyByWc.has(webContentsId)
}

// ── IPC ──────────────────────────────────────────────────────────────────────

let ipcRegistered = false

function registerMarkdownIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.on('markdown:dirty-changed', (e, dirty: unknown) => {
    if (dirty === true) dirtyByWc.add(e.sender.id)
    else dirtyByWc.delete(e.sender.id)
  })

  ipcMain.handle('markdown:consume-pending', (e) => {
    const wcId = e.sender.id
    const p = pendingOpenPaths.get(wcId) ?? pendingOpenPath
    pendingOpenPath = null
    pendingOpenPaths.delete(wcId)
    if (!p) return null
    return readMarkdownFile(p)
  })

  ipcMain.handle('markdown:open', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return readMarkdownFile(result.filePaths[0])
  })

  ipcMain.handle('markdown:open-path', (_e, filePath: unknown) => {
    if (typeof filePath !== 'string') return null
    return readMarkdownFile(filePath)
  })

  ipcMain.handle('markdown:save', async (e, data: unknown, filePath?: unknown) => {
    const target = typeof filePath === 'string' ? filePath : pendingOpenPaths.get(e.sender.id)
    if (!target) {
      const win = BrowserWindow.fromWebContents(e.sender)
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: 'untitled.md',
      })
      if (result.canceled || !result.filePath) return { ok: false }
      try {
        writeFileSync(result.filePath, typeof data === 'string' ? data : '', 'utf-8')
        pendingOpenPaths.set(e.sender.id, result.filePath)
        return { ok: true, path: result.filePath }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    }
    try {
      writeFileSync(target, typeof data === 'string' ? data : '', 'utf-8')
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('markdown:save-as', async (e, data: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: 'untitled.md',
    })
    if (result.canceled || !result.filePath) return { ok: false }
    try {
      writeFileSync(result.filePath, typeof data === 'string' ? data : '', 'utf-8')
      pendingOpenPaths.set(e.sender.id, result.filePath)
      return { ok: true, path: result.filePath }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('markdown:save-new', async (e, data: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: 'untitled.md',
    })
    if (result.canceled || !result.filePath) return { ok: false }
    try {
      writeFileSync(result.filePath, typeof data === 'string' ? data : '', 'utf-8')
      pendingOpenPaths.set(e.sender.id, result.filePath)
      return { ok: true, path: result.filePath }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('markdown:recent', () => {
    return []
  })

  ipcMain.on('markdown:print', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.webContents.print()
  })

  ipcMain.on('markdown:export-pdf', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    const result = await dialog.showSaveDialog(win, {
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: 'document.pdf',
    })
    if (result.canceled || !result.filePath) return
    const pdfData = await win.webContents.printToPDF({})
    writeFileSync(result.filePath, pdfData)
  })

  ipcMain.on('markdown:close-check-result', (e, state: unknown) => {
    const waiter = closeCheckWaiters.get(e.sender.id)
    if (waiter) waiter(state as { dirty: boolean })
  })

  ipcMain.on('markdown:close-save-result', (e, ok: unknown) => {
    const waiter = closeSaveWaiters.get(e.sender.id)
    if (waiter) waiter(ok === true)
  })
}

const closeCheckWaiters = new Map<number, (state: { dirty: boolean }) => void>()
const closeSaveWaiters = new Map<number, (ok: boolean) => void>()

// ── Close guard ──────────────────────────────────────────────────────────────

export async function requestMarkdownClose(
  contents: Electron.WebContents,
  parent?: BrowserWindow | null,
): Promise<boolean> {
  if (!dirtyByWc.has(contents.id) || contents.isDestroyed()) return true

  const options = {
    type: 'warning' as const,
    message: 'This document has unsaved changes.',
    detail: 'Do you want to save before closing?',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  }

  const { response } =
    parent && !parent.isDestroyed()
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)

  if (response === 2) return false
  if (response === 1) return true
  return await requestRendererSave(contents)
}

function requestRendererSave(contents: Electron.WebContents): Promise<boolean> {
  return new Promise((resolve) => {
    if (contents.isDestroyed()) {
      resolve(true)
      return
    }
    const timer = setTimeout(() => {
      closeSaveWaiters.delete(contents.id)
      resolve(true)
    }, 3000)
    closeSaveWaiters.set(contents.id, (ok) => {
      clearTimeout(timer)
      closeSaveWaiters.delete(contents.id)
      resolve(ok)
    })
    contents.send('markdown:close-save-request')
  })
}

// ── File I/O ─────────────────────────────────────────────────────────────────

function readMarkdownFile(filePath: string): OpenFileResult | null {
  try {
    const data = readFileSync(filePath)
    const hash = createHash('sha256').update(data).digest('hex')
    const name = filePath.split('/').pop() ?? filePath
    const ab = new ArrayBuffer(data.length)
    const view = new Uint8Array(ab)
    view.set(data)
    return { path: filePath, name, data: ab, hash }
  } catch {
    return null
  }
}

// ── Menu ─────────────────────────────────────────────────────────────────────

function sendCommand(command: string): void {
  activeMarkdownWebContents()?.send('menu:command', command)
}

let activeMarkdownWcResolver: (() => Electron.WebContents | null) | null = null

export function setMarkdownWcResolver(resolver: () => Electron.WebContents | null): void {
  activeMarkdownWcResolver = resolver
}

function activeMarkdownWebContents(): Electron.WebContents | null {
  return activeMarkdownWcResolver?.() ?? null
}

export function buildMarkdownMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
        {
          label: 'Save As...',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => sendCommand('save-as'),
        },
        { type: 'separator' },
        { label: 'Export as PDF...', click: () => sendCommand('export-pdf') },
        { label: 'Print', accelerator: 'CmdOrCtrl+P', click: () => sendCommand('print') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Format',
      submenu: [
        { label: 'Bold', accelerator: 'CmdOrCtrl+B', click: () => sendCommand('bold') },
        { label: 'Italic', accelerator: 'CmdOrCtrl+I', click: () => sendCommand('italic') },
        { label: 'Underline', accelerator: 'CmdOrCtrl+U', click: () => sendCommand('underline') },
        {
          label: 'Strikethrough',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => sendCommand('strike'),
        },
        { label: 'Code', accelerator: 'CmdOrCtrl+E', click: () => sendCommand('code') },
        { type: 'separator' },
        { label: 'Heading 1', accelerator: 'CmdOrCtrl+1', click: () => sendCommand('heading-1') },
        { label: 'Heading 2', accelerator: 'CmdOrCtrl+2', click: () => sendCommand('heading-2') },
        { label: 'Heading 3', accelerator: 'CmdOrCtrl+3', click: () => sendCommand('heading-3') },
        { type: 'separator' },
        {
          label: 'Bullet List',
          accelerator: 'CmdOrCtrl+Shift+8',
          click: () => sendCommand('bullet-list'),
        },
        {
          label: 'Ordered List',
          accelerator: 'CmdOrCtrl+Shift+7',
          click: () => sendCommand('ordered-list'),
        },
        {
          label: 'Task List',
          accelerator: 'CmdOrCtrl+Shift+9',
          click: () => sendCommand('task-list'),
        },
        { type: 'separator' },
        {
          label: 'Blockquote',
          accelerator: 'CmdOrCtrl+Shift+.',
          click: () => sendCommand('blockquote'),
        },
        {
          label: 'Code Block',
          accelerator: 'CmdOrCtrl+Shift+K',
          click: () => sendCommand('code-block'),
        },
        { label: 'Horizontal Rule', click: () => sendCommand('horizontal-rule') },
        { type: 'separator' },
        { label: 'Link', accelerator: 'CmdOrCtrl+K', click: () => sendCommand('insert-link') },
        { label: 'Image', click: () => sendCommand('insert-image') },
        { label: 'Table', click: () => sendCommand('insert-table') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => sendCommand('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => sendCommand('zoom-out') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => sendCommand('zoom-100') },
        { type: 'separator' },
        { label: 'AI Sidebar', click: () => sendCommand('toggle-ai') },
        { label: 'Dark Mode', click: () => sendCommand('toggle-dark') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── View creation ────────────────────────────────────────────────────────────

export function createMarkdownView(openPath?: string): WebContentsView {
  registerMarkdownIpc()

  const view = new WebContentsView({
    webPreferences: {
      preload: runtime.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  if (openPath) {
    pendingOpenPaths.set(view.webContents.id, openPath)
  }

  if (runtime.rendererUrl) {
    const devUrl = new URL(runtime.rendererUrl)
    devUrl.searchParams.set('mode', 'tab')
    void view.webContents.loadURL(devUrl.toString())
  } else {
    void view.webContents.loadFile(runtime.rendererFile, { query: { mode: 'tab' } })
  }

  return view
}

export function teardownMarkdownRenderer(contents: Electron.WebContents): void {
  dirtyByWc.delete(contents.id)
  if (!contents.isDestroyed()) contents.send('markdown:teardown')
}

// ── Standalone ───────────────────────────────────────────────────────────────

export function startMarkdownStandalone(): void {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }

  app.whenReady().then(() => {
    registerMarkdownIpc()
    buildMarkdownMenu()

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'GenOffice Markdown',
      webPreferences: {
        preload: runtime.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    setMarkdownWcResolver(() => win.webContents)

    if (runtime.rendererUrl) {
      void win.loadURL(runtime.rendererUrl)
    } else {
      void win.loadFile(runtime.rendererFile)
    }

    const argv = process.argv.slice()
    const fileArg = argv.find((a) => /\.(md|markdown)$/i.test(a))
    if (fileArg) {
      pendingOpenPath = fileArg
    }
  })
}
