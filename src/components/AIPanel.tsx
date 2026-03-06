import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'

interface AIPanelProps {
  open: boolean
  onClose: () => void
  panelWidth: number
  onDragStart: (e: React.MouseEvent) => void
  onExpand: () => void
  activeFile: string | null
  onContextUpdated: () => void
}

interface Message {
  role: 'user' | 'assistant' | 'divider'
  content: string
}

const TEXTAREA_MAX_HEIGHT = 124

function ExternalLinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 1h5v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 1L5.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="3" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M4 3V2a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H8" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function AIPanel({ open, onClose, panelWidth, onDragStart, onExpand, activeFile, onContextUpdated }: AIPanelProps) {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [hasAnthropic, setHasAnthropic] = useState(false)
  const [hasOpenAI, setHasOpenAI] = useState(false)
  const [hasOllama, setHasOllama] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'ollama' | 'openrouter'>('openrouter')
  const [hasOpenRouter, setHasOpenRouter] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [addingFor, setAddingFor] = useState<'anthropic' | 'openai' | 'openrouter' | null>(null)
  const [addKeyInput, setAddKeyInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [contextState, setContextState] = useState<null | 'loading' | 'review' | 'editing'>(null)
  const [contextDiff, setContextDiff] = useState<{ current: string; suggested: string } | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const contextPromptRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const providerButtonRef = useRef<HTMLButtonElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const newResponseRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/keys')
      .then(r => r.json())
      .then(d => {
        setHasKey(d.hasKey)
        setHasAnthropic(d.hasAnthropic)
        setHasOpenAI(d.hasOpenAI)
        setHasOpenRouter(d.hasOpenRouter ?? false)
        setHasOllama(d.hasOllama ?? false)
        setOllamaModels(d.ollamaModels ?? [])
        if (d.provider) setProvider(d.provider)
        else if (d.hasOllama) setProvider('ollama')
      })
  }, [])

  useEffect(() => {
    if (isLoading) {
      setTimeout(() => {
        newResponseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }, [isLoading])

  useEffect(() => {
    if (exchangeCount >= 3 && contextState === null) {
      setTimeout(() => {
        contextPromptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 50)
    }
  }, [exchangeCount, contextState])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        providerButtonRef.current && !providerButtonRef.current.contains(e.target as Node)
      ) {
        setShowProviderMenu(false)
        setAddingFor(null)
        setAddKeyInput('')
      }
    }
    if (showProviderMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showProviderMenu])

  function adjustTextareaHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT) + 'px'
  }


  function clearChat() {
    setMessages([])
    setExchangeCount(0)
    setContextState(null)
    setContextDiff(null)
    setShowDiff(false)
    setEditContent('')
  }

  async function saveKey(e: React.FormEvent) {
    e.preventDefault()
    if (!keyInput.trim()) return
    await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: keyInput.trim(), provider }),
    })
    if (provider === 'anthropic') setHasAnthropic(true)
    else if (provider === 'openai') setHasOpenAI(true)
    else setHasOpenRouter(true)
    setHasKey(true)
    setKeyInput('')
  }

  async function saveAdditionalKey(e: React.FormEvent) {
    e.preventDefault()
    if (!addKeyInput.trim() || !addingFor) return
    await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: addKeyInput.trim(), provider: addingFor }),
    })
    if (addingFor === 'anthropic') setHasAnthropic(true)
    else if (addingFor === 'openai') setHasOpenAI(true)
    else setHasOpenRouter(true)
    switchProvider(addingFor)
    setAddKeyInput('')
    setAddingFor(null)
  }

  async function removeKey(p: 'anthropic' | 'openai' | 'openrouter') {
    await fetch(`/api/keys/${p}`, { method: 'DELETE' })
    const newHasAnthropic = p === 'anthropic' ? false : hasAnthropic
    const newHasOpenAI = p === 'openai' ? false : hasOpenAI
    const newHasOpenRouter = p === 'openrouter' ? false : hasOpenRouter
    if (p === 'anthropic') setHasAnthropic(false)
    else if (p === 'openai') setHasOpenAI(false)
    else setHasOpenRouter(false)
    setHasKey(newHasAnthropic || newHasOpenAI || newHasOpenRouter)
    if (provider === p) {
      if (newHasOpenRouter) setProvider('openrouter')
      else if (newHasAnthropic) setProvider('anthropic')
      else if (newHasOpenAI) setProvider('openai')
      else if (hasOllama) setProvider('ollama')
    }
  }

  function switchProvider(p: 'anthropic' | 'openai' | 'ollama' | 'openrouter') {
    if (messages.length > 0) {
      setMessages(msgs => [...msgs, {
        role: 'divider',
        content: p === 'anthropic' ? 'Claude' : p === 'openai' ? 'OpenAI' : p === 'openrouter' ? 'OpenRouter' : 'Ollama',
      }])
    }
    setProvider(p)
    setShowProviderMenu(false)
  }

  async function send() {
    const text = inputValue.trim()
    if (!text || isLoading) return

    const userMessage: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInputValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setIsLoading(true)

    setMessages(msgs => [...msgs, { role: 'assistant', content: '' }])

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const filenames = activeFile && activeFile !== 'CONTEXT.md' ? [activeFile] : []
      const apiMessages = newMessages.filter(m => m.role !== 'divider')
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, filenames, provider, ollamaModel: ollamaModels[0] }),
        signal: controller.signal,
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        setMessages(msgs => {
          const rest = msgs.slice(0, -1)
          const last = msgs[msgs.length - 1]
          return [...rest, { ...last, content: last.content + chunk }]
        })
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Clean stop — leave partial content as-is
      } else {
        setMessages(msgs => {
          const rest = msgs.slice(0, -1)
          return [...rest, { role: 'assistant', content: 'Something went wrong. Check your API key and try again.' }]
        })
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
      setExchangeCount(c => c + 1)
    }
  }

  async function suggestContextUpdate() {
    setContextState('loading')
    try {
      const res = await fetch('/api/context-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.filter(m => m.role !== 'divider'), provider, ollamaModel: ollamaModels[0] }),
      })
      const data = await res.json()
      setContextDiff({ current: data.current, suggested: data.suggested })
      setContextState('review')
    } catch {
      setContextState(null)
    }
  }

  async function commitContent(content: string) {
    await fetch('/api/files/CONTEXT.md', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    setContextState(null)
    setContextDiff(null)
    setEditContent('')
    setShowDiff(false)
    setExchangeCount(0)
    onContextUpdated()
  }

  function dismissContextUpdate() {
    setContextState(null)
    setContextDiff(null)
    setEditContent('')
    setShowDiff(false)
    setExchangeCount(0)
  }

  function computeDiff(current: string, suggested: string) {
    const currentLines = current.split('\n')
    const suggestedLines = suggested.split('\n')
    const result: { text: string; type: 'added' | 'removed' | 'unchanged' }[] = []
    const maxLen = Math.max(currentLines.length, suggestedLines.length)
    for (let i = 0; i < maxLen; i++) {
      const cur = currentLines[i]
      const sug = suggestedLines[i]
      if (cur === sug) {
        result.push({ text: cur ?? '', type: 'unchanged' })
      } else {
        if (cur !== undefined) result.push({ text: cur, type: 'removed' })
        if (sug !== undefined) result.push({ text: sug, type: 'added' })
      }
    }
    return result
  }

  return (
    <aside
      style={{ width: panelWidth, display: open ? 'flex' : 'none' }}
      className="relative flex-shrink-0 flex-col border-l border-neutral-800 bg-neutral-950"
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-neutral-700 transition-colors z-10"
      />

      {/* Header */}
      <div className="flex items-center px-3 h-11 flex-shrink-0 border-b border-neutral-800 gap-2">
        {(hasKey || hasOllama) ? (
          <button
            ref={providerButtonRef}
            onClick={() => setShowProviderMenu(v => !v)}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors group flex-1 min-w-0"
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-accent" />
            <span className="truncate">
              {provider === 'anthropic' ? 'Claude' : provider === 'openai' ? 'OpenAI' : provider === 'openrouter' ? 'OpenRouter' : 'Ollama'}
            </span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0 text-neutral-600 group-hover:text-neutral-400 transition-colors">
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex items-center gap-0.5">
          {(hasKey || hasOllama) && (
            <button onClick={clearChat} title="New chat"
              className="p-2 text-neutral-600 hover:text-neutral-300 transition-colors rounded">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <button onClick={onExpand} title="Expand"
            className="p-2 text-neutral-600 hover:text-neutral-300 transition-colors rounded">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 5V2H5M9 2H12V5M12 9V12H9M5 12H2V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={onClose} title="Close"
            className="p-2 text-neutral-600 hover:text-neutral-300 transition-colors rounded">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Provider menu */}
      {showProviderMenu && (
        <div ref={menuRef} className="border-b border-neutral-800 pb-2">

          {/* Anthropic row */}
          {addingFor === 'anthropic' ? (
            <form onSubmit={saveAdditionalKey} className="flex gap-2 px-4 py-2 border-b border-neutral-800 last:border-0">
              <input type="password" value={addKeyInput} onChange={e => setAddKeyInput(e.target.value)}
                placeholder="sk-ant-…"
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
                autoFocus />
              <button type="submit" disabled={!addKeyInput.trim()}
                className="text-xs px-2 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors disabled:opacity-40">
                Save
              </button>
            </form>
          ) : provider === 'anthropic' ? (
            <div className="flex items-stretch border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center px-4 py-2.5 text-sm border-l-2 border-accent text-neutral-100">Claude</div>
              <div className="w-28 border-l border-neutral-800 flex items-center px-3">
                <button onClick={() => removeKey('anthropic')} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">remove key</button>
              </div>
            </div>
          ) : hasAnthropic ? (
            <div onClick={() => switchProvider('anthropic')} className="flex items-stretch cursor-pointer hover:bg-neutral-900 transition-colors border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center px-4 py-2.5 text-sm border-l-2 border-transparent text-neutral-100">Claude</div>
              <div className="w-28 border-l border-neutral-800 flex items-center px-3">
                <button onClick={e => { e.stopPropagation(); removeKey('anthropic') }} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">remove key</button>
              </div>
            </div>
          ) : (
            <div className="flex items-stretch border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center px-4 py-2.5 text-sm border-l-2 border-transparent text-neutral-600">Claude</div>
              <div className="w-28 border-l border-neutral-800 flex items-center px-3">
                <button onClick={() => setAddingFor('anthropic')} className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors">add key</button>
              </div>
            </div>
          )}

          {/* OpenAI row */}
          {addingFor === 'openai' ? (
            <form onSubmit={saveAdditionalKey} className="flex gap-2 px-4 py-2 border-b border-neutral-800 last:border-0">
              <input type="password" value={addKeyInput} onChange={e => setAddKeyInput(e.target.value)}
                placeholder="sk-…"
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
                autoFocus />
              <button type="submit" disabled={!addKeyInput.trim()}
                className="text-xs px-2 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors disabled:opacity-40">
                Save
              </button>
            </form>
          ) : provider === 'openai' ? (
            <div className="flex items-stretch border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center px-4 py-2.5 text-sm border-l-2 border-accent text-neutral-100">OpenAI</div>
              <div className="w-28 border-l border-neutral-800 flex items-center px-3">
                <button onClick={() => removeKey('openai')} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">remove key</button>
              </div>
            </div>
          ) : hasOpenAI ? (
            <div onClick={() => switchProvider('openai')} className="flex items-stretch cursor-pointer hover:bg-neutral-900 transition-colors border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center px-4 py-2.5 text-sm border-l-2 border-transparent text-neutral-100">OpenAI</div>
              <div className="w-28 border-l border-neutral-800 flex items-center px-3">
                <button onClick={e => { e.stopPropagation(); removeKey('openai') }} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">remove key</button>
              </div>
            </div>
          ) : (
            <div className="flex items-stretch border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center px-4 py-2.5 text-sm border-l-2 border-transparent text-neutral-600">OpenAI</div>
              <div className="w-28 border-l border-neutral-800 flex items-center px-3">
                <button onClick={() => setAddingFor('openai')} className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors">add key</button>
              </div>
            </div>
          )}

          {/* OpenRouter row */}
          {addingFor === 'openrouter' ? (
            <form onSubmit={saveAdditionalKey} className="flex gap-2 px-4 py-2 border-b border-neutral-800 last:border-0">
              <input type="password" value={addKeyInput} onChange={e => setAddKeyInput(e.target.value)}
                placeholder="sk-or-…"
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
                autoFocus />
              <button type="submit" disabled={!addKeyInput.trim()}
                className="text-xs px-2 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors disabled:opacity-40">
                Save
              </button>
            </form>
          ) : provider === 'openrouter' ? (
            <div className="flex items-stretch border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center px-4 py-2.5 text-sm border-l-2 border-accent text-neutral-100">OpenRouter</div>
              <div className="w-28 border-l border-neutral-800 flex items-center px-3">
                <button onClick={() => removeKey('openrouter')} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">remove key</button>
              </div>
            </div>
          ) : hasOpenRouter ? (
            <div onClick={() => switchProvider('openrouter')} className="flex items-stretch cursor-pointer hover:bg-neutral-900 transition-colors border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center px-4 py-2.5 text-sm border-l-2 border-transparent text-neutral-100">OpenRouter</div>
              <div className="w-28 border-l border-neutral-800 flex items-center px-3">
                <button onClick={e => { e.stopPropagation(); removeKey('openrouter') }} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">remove key</button>
              </div>
            </div>
          ) : (
            <div className="flex items-stretch border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex flex-col justify-center px-4 py-2.5 border-l-2 border-transparent gap-0.5">
                <span className="text-sm text-neutral-600">OpenRouter</span>
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
                  className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors inline-flex items-center gap-1">
                  Free · no card required <ExternalLinkIcon />
                </a>
              </div>
              <div className="w-28 border-l border-neutral-800 flex items-center px-3">
                <button onClick={() => setAddingFor('openrouter')} className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors">add key</button>
              </div>
            </div>
          )}

          {/* Ollama row */}
          {provider === 'ollama' ? (
            <div className="flex items-stretch border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center justify-between px-4 py-2.5 text-sm border-l-2 border-accent text-neutral-100">
                <span>Ollama</span>
                {ollamaModels[0] && <span className="text-xs text-neutral-500 pr-2">{ollamaModels[0]}</span>}
              </div>
              <div className="w-28 border-l border-neutral-800" />
            </div>
          ) : hasOllama && ollamaModels.length > 0 ? (
            <div onClick={() => switchProvider('ollama')} className="flex items-stretch cursor-pointer hover:bg-neutral-900 transition-colors border-b border-neutral-800 last:border-0">
              <div className="flex-1 flex items-center justify-between px-4 py-2.5 text-sm border-l-2 border-transparent text-neutral-100">
                <span>Ollama</span>
                <span className="text-xs text-neutral-600 pr-2">{ollamaModels[0]}</span>
              </div>
              <div className="w-28 border-l border-neutral-800" />
            </div>
          ) : hasOllama ? (
            <div className="flex flex-col px-4 py-2.5 gap-1.5 border-l-2 border-transparent border-b border-neutral-800 last:border-b-0">
              <span className="text-sm text-neutral-600">Ollama</span>
              <span className="text-xs text-neutral-600">Run this in your terminal:</span>
              <div className="flex items-center gap-1">
                <code className="flex-1 text-xs text-neutral-400 font-mono bg-neutral-900 px-2 py-1 rounded">ollama pull llama3.2</code>
                <button onClick={() => navigator.clipboard.writeText('ollama pull llama3.2')}
                  className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors flex-shrink-0" title="Copy">
                  <CopyIcon />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col px-4 py-2.5 gap-2 border-l-2 border-transparent border-b border-neutral-800 last:border-b-0">
              <span className="text-sm text-neutral-600">Ollama</span>
              <span className="text-xs text-neutral-600">Not running — open the app or:</span>
              <div className="flex items-center gap-1">
                <code className="flex-1 text-xs text-neutral-400 font-mono bg-neutral-900 px-2 py-1 rounded">ollama serve</code>
                <button onClick={() => navigator.clipboard.writeText('ollama serve')}
                  className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors flex-shrink-0" title="Copy">
                  <CopyIcon />
                </button>
              </div>
              <a href="https://ollama.com" target="_blank" rel="noreferrer"
                className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors inline-flex items-center gap-1">
                Download at ollama.com <ExternalLinkIcon />
              </a>
            </div>
          )}

        </div>
      )}

      {hasKey === null ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-neutral-600">Loading…</p>
        </div>
      ) : !hasKey && !hasOllama ? (
        <div className="flex-1 flex flex-col justify-center px-5 gap-6">

          {/* Provider list */}
          <div className="flex flex-col">
            {([
              { id: 'openrouter', label: 'OpenRouter', sub: 'Free · no card required' },
              { id: 'anthropic',  label: 'Anthropic',  sub: 'Claude' },
              { id: 'openai',     label: 'OpenAI',     sub: 'GPT-4' },
            ] as const).map(({ id, label, sub }) => (
              <button
                key={id}
                onClick={() => setProvider(id)}
                className={`flex items-center justify-between px-3 py-2.5 text-sm transition-colors border-l-2 rounded-r ${
                  provider === id
                    ? 'border-accent text-neutral-100 bg-neutral-900'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
                }`}
              >
                <span>{label}</span>
                <span className={`text-xs ${provider === id ? 'text-neutral-400' : 'text-neutral-600'}`}>{sub}</span>
              </button>
            ))}
            <button
              onClick={() => setProvider('ollama')}
              className={`flex items-center justify-between px-3 py-2.5 text-sm transition-colors border-l-2 rounded-r ${
                provider === 'ollama'
                  ? 'border-accent text-neutral-100 bg-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
              }`}
            >
              <span>Ollama</span>
              <span className={`text-xs ${provider === 'ollama' ? 'text-neutral-400' : 'text-neutral-700'}`}>Not running</span>
            </button>
          </div>

          {/* Separator */}
          <div className="h-px bg-neutral-800" />

          {/* Action area */}
          {provider === 'ollama' ? (
            <div className="flex flex-col gap-4 px-3 py-2">
              <a href="https://ollama.com" target="_blank" rel="noreferrer"
                className="text-xs inline-flex items-center gap-1 transition-colors text-accent">
                Download at ollama.com
                <ExternalLinkIcon />
              </a>
              <p className="text-xs text-neutral-500">Ollama runs AI locally — free, no key needed.</p>
            </div>
          ) : (
            <form onSubmit={saveKey} className="flex flex-col gap-3 px-3">
              {provider === 'openrouter' ? (
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
                  className="text-xs inline-flex items-center gap-1 transition-colors text-accent">
                  Get a key on openrouter.ai
                  <ExternalLinkIcon />
                </a>
              ) : (
                <a
                  href={provider === 'anthropic' ? 'https://console.anthropic.com/settings/keys' : 'https://platform.openai.com/api-keys'}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors inline-flex items-center gap-1"
                >
                  {provider === 'anthropic' ? 'Anthropic API key' : 'OpenAI API key'}
                  <ExternalLinkIcon />
                </a>
              )}
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={
                  provider === 'openrouter' ? 'sk-or-…'
                  : provider === 'anthropic' ? 'sk-ant-…'
                  : 'sk-…'
                }
                className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
              />
              <button
                type="submit"
                disabled={!keyInput.trim()}
                className="py-2 rounded bg-neutral-800 text-neutral-200 text-sm hover:bg-neutral-700 transition-colors disabled:opacity-40"
              >
                Save key
              </button>
            </form>
          )}

        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-neutral-500 text-center leading-relaxed">
                  Ask anything about<br />your open page.
                </p>
              </div>
            )}
            {messages.map((m, i) => {
              if (m.role === 'divider') return (
                <div key={i} className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-px bg-neutral-800" />
                  <span className="text-xs text-neutral-600">{m.content}</span>
                  <div className="flex-1 h-px bg-neutral-800" />
                </div>
              )
              const isStreamingMsg = isLoading && i === messages.length - 1 && m.role === 'assistant'
              return (
                <div key={i} ref={isStreamingMsg ? newResponseRef : null}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                  <div className={`relative max-w-[85%] rounded px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-neutral-800 text-neutral-200 whitespace-pre-wrap' : 'text-neutral-300'
                  }`}>
                    {m.role === 'assistant'
                      ? <div className="ai-prose"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                      : m.content
                    }
                    {m.role === 'assistant' && m.content && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(m.content)
                          setCopiedIndex(i)
                          setTimeout(() => setCopiedIndex(null), 1500)
                        }}
                        className="absolute -bottom-8 left-0 p-1.5 rounded text-neutral-600 hover:text-neutral-400 transition-colors bg-neutral-900 border border-neutral-800"
                      >
                        {copiedIndex === i ? <CheckIcon /> : <CopyIcon />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start">
                <div className="text-neutral-600 text-sm px-1">…</div>
              </div>
            )}
            {isLoading && (provider === 'ollama' || provider === 'openrouter') && (
              <p className="text-xs text-neutral-600 px-1">
                {provider === 'ollama'
                  ? 'Running locally — this may take a moment.'
                  : 'Free tier — this may take a moment.'}
              </p>
            )}
            {exchangeCount >= 3 && contextState === null && !isLoading && (
              <div ref={contextPromptRef} className="flex flex-col items-center gap-1.5 pt-1 pb-4">
                <button
                  onClick={suggestContextUpdate}
                  className="text-xs border rounded px-3 py-1.5 transition-colors text-accent border-accent/25"
                >
                  Update your context?
                </button>
                <p className="text-xs text-neutral-700 text-center leading-relaxed">
                  After a few exchanges, February can suggest<br />updates to keep your context current.
                </p>
              </div>
            )}
            {contextState === 'loading' && (
              <div className="flex justify-center pt-1">
                <p className="text-xs text-neutral-600">Reviewing your context…</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {contextState === 'review' && contextDiff !== null && (
            <div className="border-t border-neutral-800 flex flex-col">
              <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-medium">Does this still sound like you?</span>
                <button
                  onClick={() => setShowDiff(v => !v)}
                  className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  {showDiff ? 'Hide diff' : 'Show diff'}
                </button>
              </div>
              {!showDiff && (
                <div className="overflow-y-auto max-h-48 px-4 pb-2 text-xs text-neutral-300 leading-5 whitespace-pre-wrap">
                  {contextDiff.suggested}
                </div>
              )}
              {showDiff && (
                <div className="overflow-y-auto max-h-48 px-4 pb-2">
                  <div className="font-mono text-xs leading-5 rounded overflow-hidden">
                    {computeDiff(contextDiff.current, contextDiff.suggested).map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.type === 'added'
                            ? 'bg-green-950 text-green-300 px-2'
                            : line.type === 'removed'
                            ? 'bg-red-950 text-red-400 px-2 line-through opacity-60'
                            : 'text-neutral-500 px-2'
                        }
                      >
                        {line.type === 'added' ? '+ ' : line.type === 'removed' ? '− ' : '  '}
                        {line.text || ' '}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="px-4 pb-3 flex gap-3">
                <button
                  onClick={() => commitContent(contextDiff.suggested)}
                  className="text-xs text-green-500 hover:text-green-400 transition-colors"
                >
                  Yes, commit
                </button>
                <button
                  onClick={() => {
                    setEditContent(contextDiff.suggested)
                    setContextState('editing')
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors"
                >
                  Edit first
                </button>
                <button
                  onClick={dismissContextUpdate}
                  className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {contextState === 'editing' && (
            <div className="border-t border-neutral-800 flex flex-col">
              <div className="px-4 py-2">
                <span className="text-xs text-neutral-400 font-medium">Edit before committing</span>
              </div>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="mx-4 mb-2 bg-neutral-900 text-xs text-neutral-300 leading-5 rounded p-2 resize-none outline-none border border-neutral-700 focus:border-neutral-500 transition-colors"
                rows={8}
              />
              <div className="px-4 pb-3 flex gap-3">
                <button
                  onClick={() => commitContent(editContent)}
                  className="text-xs text-green-500 hover:text-green-400 transition-colors"
                >
                  Commit
                </button>
                <button
                  onClick={() => setContextState('review')}
                  className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="px-3 pb-3 pt-2 border-t border-neutral-800 flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); adjustTextareaHeight() }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              placeholder="Ask something…"
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-600 disabled:opacity-50 resize-none overflow-y-auto leading-relaxed"
              style={{ maxHeight: TEXTAREA_MAX_HEIGHT }}
            />
            {isLoading ? (
              <button
                onClick={() => abortControllerRef.current?.abort()}
                className="px-3 py-2 rounded bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!inputValue.trim()}
                className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:opacity-40 flex-shrink-0 text-accent"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 12V2M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>

          <div className="px-3 pb-3 pt-2 border-t border-neutral-800">
            <p className="text-xs text-neutral-600 px-2 py-1.5">
              <span className="text-neutral-500">Your context</span> — always included
              {activeFile && activeFile !== 'CONTEXT.md' && (
                <span> · {activeFile.replace(/\.md$/, '')}</span>
              )}
            </p>
          </div>
        </>
      )}
    </aside>
  )
}
