import { memo, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { useI18n } from '../i18n/locale'
import type { MarkdownMenuCommand } from '../../shared/ipc'

interface RibbonProps {
  editor: Editor
  activeTab: 'home' | 'insert' | 'view'
  onTabChange: (tab: 'home' | 'insert' | 'view') => void
  onCommand: (cmd: MarkdownMenuCommand) => void
  zoom: number
}

export const Ribbon = memo(function Ribbon({ editor, activeTab, onTabChange, zoom }: RibbonProps) {
  const { t } = useI18n()

  const cmd = useCallback(
    (command: MarkdownMenuCommand) => () => {
      // Dispatch via the same menu:command mechanism as the native menu
      const event = new CustomEvent('ribbon-command', { detail: command })
      window.dispatchEvent(event)
    },
    [],
  )

  const isActive = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs)

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        {(['home', 'insert', 'view'] as const).map((tab) => (
          <div
            key={tab}
            className={`ribbon-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab === 'home' ? 'Home' : tab === 'insert' ? 'Insert' : 'View'}
          </div>
        ))}
      </div>
      <div className="ribbon-content">
        {activeTab === 'home' && <HomeTab editor={editor} />}
        {activeTab === 'insert' && <InsertTab editor={editor} />}
        {activeTab === 'view' && <ViewTab zoom={zoom} />}
      </div>
    </div>
  )
})

function FormatBtn({ editor, mark, label }: { editor: Editor; mark: string; label: string }) {
  return (
    <button
      className={`ribbon-btn ${isActive(editor, mark) ? 'active' : ''}`}
      onClick={() => editor.chain().focus().toggleMark(mark).run()}
      title={label}
    >
      {label.charAt(0)}
    </button>
  )
}

function isActive(editor: Editor, name: string, attrs?: Record<string, unknown>): boolean {
  return editor.isActive(name, attrs)
}

function HeadingBtn({ editor, level, label }: { editor: Editor; level: 1 | 2 | 3; label: string }) {
  return (
    <button
      className={`ribbon-btn ${isActive(editor, 'heading', { level }) ? 'active' : ''}`}
      onClick={() => editor.chain().focus().toggleNode('heading', 'paragraph', { level }).run()}
      title={label}
    >
      H{level}
    </button>
  )
}

function HomeTab({ editor }: { editor: Editor }) {
  return (
    <>
      <div className="ribbon-group">
        <FormatBtn editor={editor} mark="bold" label="B" />
        <FormatBtn editor={editor} mark="italic" label="I" />
        <FormatBtn editor={editor} mark="strike" label="S" />
        <FormatBtn editor={editor} mark="underline" label="U" />
        <FormatBtn editor={editor} mark="code" label="<>" />
      </div>
      <div className="ribbon-group">
        <HeadingBtn editor={editor} level={1} label="H1" />
        <HeadingBtn editor={editor} level={2} label="H2" />
        <HeadingBtn editor={editor} level={3} label="H3" />
      </div>
      <div className="ribbon-group">
        <button
          className={`ribbon-btn ${isActive(editor, 'bulletList') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleList('bulletList', 'listItem').run()}
          title="Bullet List"
        >
          •
        </button>
        <button
          className={`ribbon-btn ${isActive(editor, 'orderedList') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleList('orderedList', 'listItem').run()}
          title="Ordered List"
        >
          1.
        </button>
        <button
          className={`ribbon-btn ${isActive(editor, 'taskList') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleList('taskList', 'taskItem').run()}
          title="Task List"
        >
          ☑
        </button>
      </div>
      <div className="ribbon-group">
        <button
          className={`ribbon-btn ${isActive(editor, 'blockquote') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleNode('blockquote', 'paragraph').run()}
          title="Blockquote"
        >
          "
        </button>
        <button
          className={`ribbon-btn ${isActive(editor, 'codeBlock') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleNode('codeBlock', 'paragraph').run()}
          title="Code Block"
        >
          {}
        </button>
        <button
          className="ribbon-btn"
          // @ts-ignore — TipTap duplicate module type mismatch
          onClick={() => editor.commands.setHorizontalRule()}
          title="Horizontal Rule"
        >
          —
        </button>
      </div>
      <div className="ribbon-group">
        <button
          className={`ribbon-btn ${isActive(editor, 'link') ? 'active' : ''}`}
          onClick={() => {
            const url = window.prompt('Enter URL:')
            // @ts-ignore — TipTap duplicate module type mismatch
            if (url) editor.commands.setLink({ href: url })
          }}
          title="Link"
        >
          🔗
        </button>
      </div>
      <div className="ribbon-group">
        <button
          className={`ribbon-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
          // @ts-ignore — TipTap duplicate module type mismatch
          onClick={() => editor.commands.setTextAlign('left')}
          title="Align Left"
        >
          ≡
        </button>
        <button
          className={`ribbon-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
          // @ts-ignore — TipTap duplicate module type mismatch
          onClick={() => editor.commands.setTextAlign('center')}
          title="Align Center"
        >
          ≡
        </button>
        <button
          className={`ribbon-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
          // @ts-ignore — TipTap duplicate module type mismatch
          onClick={() => editor.commands.setTextAlign('right')}
          title="Align Right"
        >
          ≡
        </button>
      </div>
    </>
  )
}

function InsertTab({ editor }: { editor: Editor }) {
  return (
    <>
      <div className="ribbon-group">
        <button
          className="ribbon-btn ribbon-btn-wide"
          onClick={() => {
            const url = window.prompt('Enter image URL:')
            // @ts-ignore — TipTap duplicate module type mismatch
            if (url) editor.commands.setImage({ src: url })
          }}
        >
          Image
        </button>
        <button
          className="ribbon-btn ribbon-btn-wide"
          onClick={() => {
            const url = window.prompt('Enter URL:')
            // @ts-ignore — TipTap duplicate module type mismatch
            if (url) editor.commands.setLink({ href: url })
          }}
        >
          Link
        </button>
      </div>
      <div className="ribbon-group">
        <button
          className="ribbon-btn ribbon-btn-wide"
          // @ts-ignore — TipTap duplicate module type mismatch
          onClick={() => editor.commands.setHorizontalRule()}
        >
          HR
        </button>
        <button
          className="ribbon-btn ribbon-btn-wide"
          // @ts-ignore — TipTap duplicate module type mismatch
          onClick={() => editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true })}
        >
          Table
        </button>
      </div>
      <div className="ribbon-group">
        <button
          className="ribbon-btn ribbon-btn-wide"
          onClick={() => editor.chain().focus().toggleNode('codeBlock', 'paragraph').run()}
        >
          Code Block
        </button>
        <button
          className="ribbon-btn ribbon-btn-wide"
          onClick={() => editor.chain().focus().toggleNode('blockquote', 'paragraph').run()}
        >
          Quote
        </button>
      </div>
    </>
  )
}

function ViewTab({ zoom }: { zoom: number }) {
  return (
    <>
      <div className="ribbon-group">
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '0 8px' }}>
          Zoom: {zoom}%
        </span>
      </div>
    </>
  )
}
