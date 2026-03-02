import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'

interface CanvasProps {
  onOpenAI: () => void
  filename: string | null
  content: string
  onSave: (content: string) => void
  onRename: (newName: string) => void
}

function stripMd(filename: string) {
  return filename.replace(/\.md$/, '')
}

export default function Canvas({ onOpenAI, filename, content, onSave, onRename }: CanvasProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [title, setTitle] = useState('')

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    editable: false,
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onSave(editor.storage.markdown.getMarkdown())
      }, 2000)
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(filename !== null)
    if (content) {
      editor.commands.setContent(content)
    } else {
      editor.commands.clearContent()
    }
  }, [filename, content]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTitle(filename ? stripMd(filename) : '')
  }, [filename])

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      setTitle(filename ? stripMd(filename) : '')
      e.currentTarget.blur()
    }
  }

  function handleTitleBlur() {
    const trimmed = title.trim()
    if (!trimmed || !filename || trimmed === stripMd(filename)) return
    onRename(trimmed)
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        {filename && filename !== 'CONTEXT.md' ? (
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            className="bg-transparent text-sm text-neutral-400 focus:text-neutral-200 outline-none w-48 truncate"
            aria-label="Page title"
          />
        ) : (
          <span className="text-sm text-neutral-500">
            {filename === 'CONTEXT.md' ? 'Your context' : ''}
          </span>
        )}
        <button
          onClick={onOpenAI}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Ask AI
        </button>
      </div>

      {/* Writing area — full area is click target */}
      <div
        className="flex-1 overflow-y-auto cursor-text"
        onClick={() => editor?.commands.focus()}
      >
        <div className="max-w-[700px] mx-auto px-8 py-12 min-h-full">
          {filename ? (
            <EditorContent editor={editor} className="tiptap" />
          ) : (
            <p className="text-neutral-600 text-sm">Select a page or create one.</p>
          )}
        </div>
      </div>
    </main>
  )
}
