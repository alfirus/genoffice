import type { AiChatRequest, AiChatResponse, AiSettings, AiStreamChunk, AiStreamRequest, GenSparkAccountStatus } from '@genoffice/ai-provider'
import type { AgentMessage, AgentToolCall, AgentToolDef, AgentToolResult } from '@genoffice/agent-core'

export type MarkdownMenuCommand =
  | 'new' | 'open' | 'open-path' | 'save' | 'save-as'
  | 'undo' | 'redo'
  | 'zoom-in' | 'zoom-out' | 'zoom-100'
  | 'toggle-ai' | 'toggle-dark'
  | 'bold' | 'italic' | 'strike' | 'code' | 'underline'
  | 'heading-1' | 'heading-2' | 'heading-3'
  | 'bullet-list' | 'ordered-list' | 'task-list'
  | 'blockquote' | 'code-block' | 'horizontal-rule'
  | 'insert-link' | 'insert-image' | 'insert-table'
  | 'align-left' | 'align-center' | 'align-right' | 'align-justify'
  | 'find' | 'print' | 'export-pdf' | 'word-count'

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
  save(data: string, filePath?: string | null): Promise<{ ok: boolean; path?: string; error?: string }>
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
