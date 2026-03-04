import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'

interface CanvasProps {
  onOpenAI: () => void
  aiPanelOpen: boolean
  filename: string | null
  content: string
  onSave: (content: string) => void
  onRename: (newName: string) => void
}

function stripMd(filename: string) {
  return filename.replace(/\.md$/, '')
}

export default function Canvas({ onOpenAI, aiPanelOpen, filename, content, onSave, onRename }: CanvasProps) {
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
    if (filename) {
      if (content) {
        editor.commands.setContent(content)
      } else {
        editor.commands.clearContent(false)
      }
    }
  }, [filename, content]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTitle(filename ? stripMd(filename) : '')
  }, [filename])

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
      editor?.commands.focus()
    }
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
      <div className="flex items-center justify-end px-4 h-11 flex-shrink-0 border-b border-neutral-800">
        {!aiPanelOpen && (
          <button
            onClick={onOpenAI}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Ask AI
          </button>
        )}
      </div>

      {/* Writing area — full area is click target */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[700px] mx-auto px-8 py-12 min-h-full">
          {/* Non-Tiptap content — React freely inserts/removes here */}
          <div>
            {filename && filename !== 'CONTEXT.md' && (
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                placeholder="Untitled"
                className="w-full bg-transparent text-2xl font-semibold text-neutral-100 placeholder-neutral-700 outline-none mb-8 block"
                aria-label="Page title"
              />
            )}
            {filename === 'CONTEXT.md' && (
              <p className="text-2xl font-semibold text-neutral-100 mb-8">Your context</p>
            )}
            {!filename && (
              <>
                <p className="text-neutral-300 text-sm">This is where your thinking lives.</p>
                <p className="text-neutral-600 text-sm mt-1">Pick a page or start a new one.</p>
              </>
            )}
          </div>
          {/* Tiptap content — isolated, never unmounted, hidden via display */}
          <div
            style={{ display: filename ? undefined : 'none' }}
            onClick={() => editor?.commands.focus()}
            className="cursor-text"
          >
            {editor && (
              <BubbleMenu
                editor={editor}
                tippyOptions={{ duration: 100 }}
              >
                <div className="flex items-center bg-neutral-800 border border-neutral-700 rounded shadow-lg overflow-hidden">
                  <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${editor.isActive('bold') ? 'text-neutral-100 bg-neutral-700' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >B</button>
                  <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`px-2.5 py-1.5 text-xs italic transition-colors ${editor.isActive('italic') ? 'text-neutral-100 bg-neutral-700' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >I</button>
                  <button
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    className={`px-2.5 py-1.5 text-xs font-mono transition-colors ${editor.isActive('code') ? 'text-neutral-100 bg-neutral-700' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >&lt;/&gt;</button>
                  <div className="w-px h-4 bg-neutral-700 mx-0.5" />
                  <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={`px-2.5 py-1.5 text-xs transition-colors ${editor.isActive('heading', { level: 2 }) ? 'text-neutral-100 bg-neutral-700' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >H2</button>
                  <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    className={`px-2.5 py-1.5 text-xs transition-colors ${editor.isActive('heading', { level: 3 }) ? 'text-neutral-100 bg-neutral-700' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >H3</button>
                  <div className="w-px h-4 bg-neutral-700 mx-0.5" />
                  <button
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className={`px-2.5 py-1.5 text-xs line-through transition-colors ${editor.isActive('strike') ? 'text-neutral-100 bg-neutral-700' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >S</button>
                  <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`px-2.5 py-1.5 transition-colors ${editor.isActive('bulletList') ? 'text-neutral-100 bg-neutral-700' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="2" cy="4" r="1" fill="currentColor"/>
                      <circle cx="2" cy="7" r="1" fill="currentColor"/>
                      <circle cx="2" cy="10" r="1" fill="currentColor"/>
                      <line x1="5" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="5" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="5" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    className={`px-2.5 py-1.5 text-xs transition-colors ${editor.isActive('blockquote') ? 'text-neutral-100 bg-neutral-700' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >"</button>
                </div>
              </BubbleMenu>
            )}
            <EditorContent editor={editor} className="tiptap" />
          </div>
        </div>
      </div>
    </main>
  )
}
