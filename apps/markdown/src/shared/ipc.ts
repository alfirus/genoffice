import type {
  AiChatRequest,
  AiChatResponse,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  GenSparkAccountStatus,
} from '@genoffice/ai-provider'
import type { AgentMessage } from '@genoffice/agent-core'

export const MARKDOWN_CHANNELS = {
  consumePending: 'markdown:consume-pending',
  readFile: 'markdown:read-file',
  save: 'markdown:save',
  saveRequest: 'markdown:save-request',
  saveRequestAck: 'markdown:save-request-ack',
  dirtyChanged: 'markdown:dirty-changed',
  closeSaveRequest: 'markdown:close-save-request',
  closeSaveResult: 'markdown:close-save-result',
  fileRenamed: 'markdown:file-renamed',
  pickImage: 'markdown:pick-image',
  saveImage: 'markdown:save-image',
  readImage: 'markdown:read-image',
  exportRequest: 'markdown:export-request',
  exportDocx: 'markdown:export-docx',
  exportPdf: 'markdown:export-pdf',
  getLanguage: 'app:get-language',
  languageChanged: 'app:language-changed',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
} as const

export type UiTheme = 'light' | 'dark' | 'system'

export type MarkdownMenuCommand =
  | 'new'
  | 'open'
  | 'open-path'
  | 'save'
  | 'save-as'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-100'
  | 'toggle-ai'
  | 'toggle-dark'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'underline'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'blockquote'
  | 'code-block'
  | 'horizontal-rule'
  | 'insert-link'
  | 'insert-image'
  | 'insert-table'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'align-justify'
  | 'find'
  | 'print'
  | 'export-pdf'
  | 'word-count'

export interface OpenFileResult {
  path: string
  name: string
  data: ArrayBuffer
  hash: string
}

export interface MarkdownTabInfo {
  id: string
  title: string
  focused: boolean
}

export interface DesktopApi {
  getLanguage(): Promise<string>
  open(): Promise<OpenFileResult | null>
  openPath(filePath: string): Promise<OpenFileResult | null>
  consumePendingOpen(): Promise<OpenFileResult | null>
  save(
    data: string,
    filePath?: string | null,
  ): Promise<{ ok: boolean; path?: string; error?: string }>
  saveAs(data: string): Promise<{ ok: boolean; path?: string; error?: string }>
  saveNew(data: string): Promise<{ ok: boolean; path?: string; error?: string }>
  recent(): Promise<Array<{ name: string; path: string }>>
  print(): void
  exportPdf(): void
  onMenuCommand(handler: (command: MarkdownMenuCommand, payload?: string) => void): () => void
  onCloseCheck(handler: () => void): () => void
  onCloseSaveRequest(handler: () => void): () => void
  reportCloseCheckResult(state: { dirty: boolean }): void
  reportCloseSaveResult(ok: boolean): void
  onTeardown(handler: () => void): () => void
  onLanguageChanged(handler: (lang: string) => void): () => void
  getTheme(): Promise<'light' | 'dark' | 'system'>
  onThemeChanged(handler: (theme: string) => void): () => void
  onDirtyChanged(dirty: boolean): void
  winNew(): void
  winList(): Promise<MarkdownTabInfo[]>
  winFocus(id: string): void
  aiGetSettings(): Promise<AiSettings>
  aiSetSettings(settings: AiSettings): Promise<void>
  aiChat(request: AiChatRequest): Promise<AiChatResponse>
  aiStream(request: AiStreamRequest): Promise<void>
  aiStreamCancel(): void
  aiStreamChunk(handler: (chunk: AiStreamChunk) => void): () => void
  aiGskStatus(): Promise<GenSparkAccountStatus>
  aiGskLogin(): Promise<void>
  aiWebSearch(query: string): Promise<string>
  aiFetchImage(url: string): Promise<{ base64: string; mime: string } | null>
  webUtils: { getPathForFile(file: File): string }
}

export interface ProjectApi {
  resolveChat(filePath: string): Promise<string>
  appendChat(filePath: string, messages: AgentMessage[]): Promise<void>
  loadChat(filePath: string): Promise<AgentMessage[]>
  rebindChat(filePath: string, chatPath: string): Promise<void>
  list(): Promise<Array<{ name: string; path: string }>>
  create(name: string): Promise<{ name: string; path: string }>
  rename(oldPath: string, newName: string): Promise<string>
  delete(filePath: string): Promise<void>
  moveFile(filePath: string, projectPath: string): Promise<void>
  timeline(filePath: string): Promise<Array<{ date: string; label: string }>>
}

// ── Export / Save types (used by markdown-main.ts) ──────────────────────────

export type SaveMode = 'save' | 'saveAs'

export interface SaveMarkdownRequest {
  /** full document text (frontmatter included) */
  text: string
  mode: SaveMode
  suggestedName?: string
}

export type SaveMarkdownResult =
  { ok: true; path: string } | { ok: true; canceled: true } | { ok: false; error: string }

export type ExportFormat = 'pdf' | 'docx' | 'docs'

export interface ExportDocxRequest {
  base64: string
  suggestedName: string
  mode: 'dialog' | 'openInDocs'
}

export interface ExportPdfRequest {
  html: string
  suggestedName: string
}

export type ExportResult =
  { ok: true; path: string } | { ok: true; canceled: true } | { ok: false; error: string }

export interface ImageData {
  base64: string
  mime: 'image/png' | 'image/jpeg' | 'image/gif'
}
