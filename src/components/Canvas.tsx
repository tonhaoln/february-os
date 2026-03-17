import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import Whiteboard from './Whiteboard'

interface CanvasProps {
  onOpenAI: () => void
  aiPanelOpen: boolean
  filename: string | null
  content: string
  onSave: (content: string) => void
  onRename: (newName: string) => void
  mode: 'editor' | 'canvas'
  onModeChange: (mode: 'editor' | 'canvas') => void
  onEndSession: (filename: string) => void
}

function stripMd(filename: string) {
  return filename.replace(/\.md$/, '')
}

export default function Canvas({ onOpenAI, aiPanelOpen, filename, content, onSave, onRename, mode, onModeChange, onEndSession }: CanvasProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [title, setTitle] = useState('')
  const [improving, setImproving] = useState(false)
  const [suggestion, setSuggestion] = useState<{ from: number; to: number; improved: string } | null>(null)
  const [copiedSuggestion, setCopiedSuggestion] = useState(false)
  const suggestionRef = useRef(suggestion)
  suggestionRef.current = suggestion

  const editor = useEditor({
    extensions: [StarterKit, Markdown.configure({ transformPastedText: true })],
    editable: false,
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onSave(editor.storage.markdown.getMarkdown())
      }, 2000)
    },
    onSelectionUpdate: () => {
      if (suggestionRef.current) setSuggestion(null)
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

  async function handleImprove() {
    if (!editor || improving) return
    const { from, to } = editor.state.selection
    if (from === to) return
    const slice = editor.state.doc.slice(from, to)
    const selectedMarkdown = editor.storage.markdown.serializer.serialize(slice.content)
    if (!selectedMarkdown.trim()) return
    setImproving(true)
    try {
      const res = await fetch('/api/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedMarkdown }),
      })
      const data = await res.json()
      if (data.improved) {
        setSuggestion({ from, to, improved: data.improved })
      }
    } catch {
      // Silent — don't break the editor
    } finally {
      setImproving(false)
    }
  }

  function acceptSuggestion() {
    if (!editor || !suggestion) return
    editor.chain().focus().insertContentAt({ from: suggestion.from, to: suggestion.to }, suggestion.improved).run()
    setSuggestion(null)
  }

  async function handleReimprove() {
    if (!editor || !suggestion || improving) return
    const { from, to } = suggestion
    const slice = editor.state.doc.slice(from, to)
    const text = editor.storage.markdown.serializer.serialize(slice.content)
    if (!text.trim()) return
    setSuggestion(null)
    setImproving(true)
    try {
      const res = await fetch('/api/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (data.improved) {
        setSuggestion({ from, to, improved: data.improved })
      }
    } catch {
      // Silent
    } finally {
      setImproving(false)
    }
  }

  function copySuggestion() {
    if (!suggestion) return
    navigator.clipboard.writeText(suggestion.improved)
    setCopiedSuggestion(true)
    setTimeout(() => setCopiedSuggestion(false), 1500)
  }

  function dismissSuggestion() {
    setSuggestion(null)
  }

  function handleTitleBlur() {
    const trimmed = title.trim()
    if (!trimmed || !filename || trimmed === stripMd(filename)) return
    onRename(trimmed)
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-11 flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onModeChange('editor')}
            className={`px-2.5 py-1.5 rounded text-xs transition-colors ${mode === 'editor' ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-800' : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'}`}
            title="Editor"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 2h8a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M4 5h6M4 7h6M4 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            onClick={() => onModeChange('canvas')}
            className={`px-2.5 py-1.5 rounded text-xs transition-colors ${mode === 'canvas' ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-800' : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'}`}
            title="Canvas"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="2" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="8" y="2" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="2" y="8" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="8" y="8" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </div>
        <div>
          {!aiPanelOpen && (
            <button
              onClick={onOpenAI}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-neutral-400 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Ask AI
            </button>
          )}
        </div>
      </div>

      {/* Writing area — full area is click target */}
      <div className="flex-1 overflow-y-auto" style={{ display: mode === 'editor' ? undefined : 'none' }}>
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
                className="w-full bg-transparent text-2xl font-semibold text-neutral-900 dark:text-neutral-100 placeholder-neutral-300 dark:placeholder-neutral-700 outline-none mb-8 block"
                aria-label="Page title"
              />
            )}
            {filename === 'CONTEXT.md' && (
              <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-8">Your context</p>
            )}
            {!filename && (
              <>
                <p className="text-neutral-600 dark:text-neutral-300 text-sm">This is where your thinking lives.</p>
                <p className="text-neutral-400 dark:text-neutral-600 text-sm mt-1">Pick a page or start a new one.</p>
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
                tippyOptions={{ duration: 100, placement: 'bottom-start', popperOptions: { modifiers: [{ name: 'preventOverflow', options: { boundary: 'viewport', padding: 8 } }, { name: 'flip', options: { fallbackPlacements: ['top-start', 'bottom-start'] } }] } }}
              >
                {suggestion ? (
                  <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg min-w-[280px] max-w-md">
                    <div className="px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 max-h-[150px] overflow-y-auto whitespace-pre-wrap">
                      {suggestion.improved}
                    </div>
                    <div className="flex border-t border-neutral-200 dark:border-neutral-700">
                      <button onClick={acceptSuggestion} className="flex-1 px-3 py-2 text-xs text-accent dark:text-accent-soft hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors rounded-bl">
                        Accept
                      </button>
                      <div className="w-px bg-neutral-200 dark:bg-neutral-700" />
                      <button onClick={handleReimprove} className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors" title="Regenerate">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M1 6a5 5 0 019-3M11 6a5 5 0 01-9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          <path d="M10 1v2h-2M2 11V9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <div className="w-px bg-neutral-200 dark:bg-neutral-700" />
                      <button onClick={copySuggestion} className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors" title="Copy">
                        {copiedSuggestion ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <rect x="1" y="3" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                            <path d="M4 3V2a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H8" stroke="currentColor" strokeWidth="1.2"/>
                          </svg>
                        )}
                      </button>
                      <div className="w-px bg-neutral-200 dark:bg-neutral-700" />
                      <button onClick={dismissSuggestion} className="flex-1 px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors rounded-br">
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : improving ? (
                  <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg min-w-[280px] px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">
                    Improving…
                  </div>
                ) : (
                  <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg overflow-hidden">
                    <button
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${editor.isActive('bold') ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-700' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
                    >B</button>
                    <button
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      className={`px-2.5 py-1.5 text-xs italic transition-colors ${editor.isActive('italic') ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-700' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
                    >I</button>
                    <button
                      onClick={() => editor.chain().focus().toggleCode().run()}
                      className={`px-2.5 py-1.5 text-xs font-mono transition-colors ${editor.isActive('code') ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-700' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
                    >&lt;/&gt;</button>
                    <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
                    <button
                      onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                      className={`px-2.5 py-1.5 text-xs transition-colors ${editor.isActive('heading', { level: 2 }) ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-700' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
                    >H2</button>
                    <button
                      onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                      className={`px-2.5 py-1.5 text-xs transition-colors ${editor.isActive('heading', { level: 3 }) ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-700' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
                    >H3</button>
                    <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
                    <button
                      onClick={() => editor.chain().focus().toggleStrike().run()}
                      className={`px-2.5 py-1.5 text-xs line-through transition-colors ${editor.isActive('strike') ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-700' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
                    >S</button>
                    <button
                      onClick={() => editor.chain().focus().toggleBulletList().run()}
                      className={`px-2.5 py-1.5 transition-colors ${editor.isActive('bulletList') ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-700' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
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
                      className={`px-2.5 py-1.5 text-xs transition-colors ${editor.isActive('blockquote') ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-700' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
                    >"</button>
                    <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
                    <button
                      onClick={handleImprove}
                      disabled={improving}
                      className="px-2.5 py-1.5 text-xs transition-colors text-accent dark:text-accent-soft hover:text-accent-hover dark:hover:text-accent-soft-hover"
                    >Improve</button>
                  </div>
                )}
              </BubbleMenu>
            )}
            <EditorContent editor={editor} className="tiptap" />
          </div>
        </div>
      </div>

      {/* Canvas mode — tldraw */}
      <div style={{ display: mode === 'canvas' ? undefined : 'none' }} className="flex-1">
        <Whiteboard onEndSession={onEndSession} />
      </div>
    </main>
  )
}
