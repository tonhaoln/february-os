import { useState, useEffect, useRef } from 'react'

interface AIPanelProps {
  onClose: () => void
  activeFile: string | null
  onContextUpdated: () => void
}

interface Message {
  role: 'user' | 'assistant' | 'divider'
  content: string
}

export default function AIPanel({ onClose, activeFile, onContextUpdated }: AIPanelProps) {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [hasAnthropic, setHasAnthropic] = useState(false)
  const [hasOpenAI, setHasOpenAI] = useState(false)
  const [hasOllama, setHasOllama] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'ollama'>('anthropic')
  const [keyInput, setKeyInput] = useState('')
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [addingFor, setAddingFor] = useState<'anthropic' | 'openai' | null>(null)
  const [addKeyInput, setAddKeyInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [contextState, setContextState] = useState<null | 'loading' | 'review'>(null)
  const [contextDiff, setContextDiff] = useState<{ current: string; suggested: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const contextPromptRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const providerButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    fetch('/api/keys')
      .then(r => r.json())
      .then(d => {
        setHasKey(d.hasKey)
        setHasAnthropic(d.hasAnthropic)
        setHasOpenAI(d.hasOpenAI)
        setHasOllama(d.hasOllama ?? false)
        setOllamaModels(d.ollamaModels ?? [])
        if (d.provider) setProvider(d.provider)
        else if (d.hasOllama) setProvider('ollama')
      })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  async function saveKey(e: React.FormEvent) {
    e.preventDefault()
    if (!keyInput.trim()) return
    await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: keyInput.trim(), provider }),
    })
    if (provider === 'anthropic') setHasAnthropic(true)
    else setHasOpenAI(true)
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
    else setHasOpenAI(true)
    switchProvider(addingFor)
    setAddKeyInput('')
    setAddingFor(null)
  }

  function switchProvider(p: 'anthropic' | 'openai' | 'ollama') {
    if (messages.length > 0) {
      setMessages(msgs => [...msgs, {
        role: 'divider',
        content: p === 'anthropic' ? 'Claude' : p === 'openai' ? 'OpenAI' : 'Ollama',
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
    setIsLoading(true)

    const assistantMessage: Message = { role: 'assistant', content: '' }
    setMessages(msgs => [...msgs, assistantMessage])

    try {
      const filenames = activeFile && activeFile !== 'CONTEXT.md' ? [activeFile] : []
      const apiMessages = newMessages.filter(m => m.role !== 'divider')
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, filenames, provider, ollamaModel: ollamaModels[0] }),
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
    } catch {
      setMessages(msgs => {
        const rest = msgs.slice(0, -1)
        return [...rest, { role: 'assistant', content: 'Something went wrong. Check your API key and try again.' }]
      })
    } finally {
      setIsLoading(false)
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

  async function approveContextUpdate() {
    if (!contextDiff) return
    await fetch('/api/files/CONTEXT.md', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: contextDiff.suggested }),
    })
    setContextState(null)
    setContextDiff(null)
    setExchangeCount(0)
    onContextUpdated()
  }

  function dismissContextUpdate() {
    setContextState(null)
    setContextDiff(null)
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <aside className="w-80 flex-shrink-0 flex flex-col border-l border-neutral-800 bg-neutral-950">
      {/* Header */}
      <div className="flex items-center px-4 h-11 flex-shrink-0 border-b border-neutral-800 gap-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors flex-1"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Ask AI
        </button>
        {(hasKey || hasOllama) && (
          <button
            ref={providerButtonRef}
            onClick={() => setShowProviderMenu(v => !v)}
            className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-neutral-100 transition-colors group"
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#b685ff' }} />
            <span>{provider === 'anthropic' ? 'Claude' : provider === 'openai' ? 'OpenAI' : 'Ollama'}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-neutral-600 group-hover:text-neutral-400 transition-colors">
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Provider menu */}
      {showProviderMenu && (
        <div ref={menuRef} className="border-b border-neutral-800 px-4 py-3 space-y-1">
          {/* Anthropic row */}
          {provider === 'anthropic' ? (
            <div className="flex items-center justify-between text-xs px-2 py-1">
              <span className="text-neutral-300">Claude</span>
              <span className="text-neutral-600">active</span>
            </div>
          ) : hasAnthropic ? (
            <button onClick={() => switchProvider('anthropic')}
              className="w-full flex items-center text-xs text-neutral-600 hover:text-neutral-300 hover:bg-neutral-900 rounded px-2 py-1 transition-colors">
              Claude
            </button>
          ) : addingFor !== 'anthropic' ? (
            <div className="flex items-center justify-between text-xs px-2 py-1">
              <span className="text-neutral-600">Claude</span>
              <button onClick={() => setAddingFor('anthropic')}
                className="text-neutral-600 hover:text-neutral-400 transition-colors">add key</button>
            </div>
          ) : null}
          {/* OpenAI row */}
          {provider === 'openai' ? (
            <div className="flex items-center justify-between text-xs px-2 py-1">
              <span className="text-neutral-300">OpenAI</span>
              <span className="text-neutral-600">active</span>
            </div>
          ) : hasOpenAI ? (
            <button onClick={() => switchProvider('openai')}
              className="w-full flex items-center text-xs text-neutral-600 hover:text-neutral-300 hover:bg-neutral-900 rounded px-2 py-1 transition-colors">
              OpenAI
            </button>
          ) : addingFor !== 'openai' ? (
            <div className="flex items-center justify-between text-xs px-2 py-1">
              <span className="text-neutral-600">OpenAI</span>
              <button onClick={() => setAddingFor('openai')}
                className="text-neutral-600 hover:text-neutral-400 transition-colors">add key</button>
            </div>
          ) : null}
          {/* Ollama row */}
          {provider === 'ollama' ? (
            <div className="flex items-center justify-between text-xs px-2 py-1">
              <div className="flex items-center gap-2">
                <span className="text-neutral-300">Ollama</span>
                {ollamaModels[0] && <span className="text-neutral-600">{ollamaModels[0]}</span>}
              </div>
              <span className="text-neutral-600">active</span>
            </div>
          ) : hasOllama && ollamaModels.length > 0 ? (
            <button onClick={() => switchProvider('ollama')}
              className="w-full flex items-center justify-between text-xs text-neutral-600 hover:text-neutral-300 hover:bg-neutral-900 rounded px-2 py-1 transition-colors">
              <span>Ollama</span>
              <span>{ollamaModels[0]}</span>
            </button>
          ) : hasOllama ? (
            <div className="flex items-center justify-between text-xs px-2 py-1">
              <span className="text-neutral-600">Ollama</span>
              <span className="text-neutral-600 font-mono">ollama pull llama3.2</span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs px-2 py-1">
              <span className="text-neutral-600">Ollama</span>
              <a href="https://ollama.com" target="_blank" rel="noreferrer"
                className="text-neutral-600 hover:text-neutral-400 transition-colors">not running</a>
            </div>
          )}
          {addingFor && (
            <form onSubmit={saveAdditionalKey} className="flex gap-2 pt-1">
              <input
                type="password"
                value={addKeyInput}
                onChange={e => setAddKeyInput(e.target.value)}
                placeholder={addingFor === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
              />
              <button type="submit" disabled={!addKeyInput.trim()}
                className="text-xs px-2 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors disabled:opacity-40">
                Save
              </button>
            </form>
          )}
        </div>
      )}

      {hasKey === null ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-neutral-600">Loading…</p>
        </div>
      ) : !hasKey && !hasOllama ? (
        <form onSubmit={saveKey} className="flex-1 flex flex-col justify-center px-6 gap-4">
          <p className="text-sm text-neutral-300">Add your API key to start.</p>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
            className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            disabled={!keyInput.trim()}
            className="py-2 rounded bg-neutral-700 text-neutral-100 text-sm hover:bg-neutral-600 transition-colors disabled:opacity-40"
          >
            Save key
          </button>
          <button
            type="button"
            onClick={() => setProvider(p => p === 'anthropic' ? 'openai' : 'anthropic')}
            className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors -mt-2"
          >
            {provider === 'anthropic' ? 'Using OpenAI instead?' : 'Using Anthropic instead?'}
          </button>
          <p className="text-xs text-neutral-600 text-center -mt-1">
            No API key?{' '}
            <a href="https://ollama.com" target="_blank" rel="noreferrer"
              className="text-neutral-500 hover:text-neutral-400 transition-colors underline">
              Run Ollama locally
            </a>{' '}
            for free.
          </p>
        </form>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <p className="text-xs text-neutral-600 text-center mt-8">
                Ask anything about your open page.
              </p>
            )}
            {messages.map((m, i) => {
              if (m.role === 'divider') return (
                <div key={i} className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-px bg-neutral-800" />
                  <span className="text-xs text-neutral-600">{m.content}</span>
                  <div className="flex-1 h-px bg-neutral-800" />
                </div>
              )
              return (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-neutral-800 text-neutral-200' : 'text-neutral-300'
                  }`}>
                    {m.content}
                  </div>
                </div>
              )
            })}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start">
                <div className="text-neutral-600 text-sm px-1">…</div>
              </div>
            )}
            {exchangeCount >= 3 && contextState === null && !isLoading && (
              <div ref={contextPromptRef} className="flex flex-col items-center gap-1.5 pt-1 pb-4">
                <button
                  onClick={suggestContextUpdate}
                  className="text-xs border rounded px-3 py-1.5 transition-colors"
                  style={{ color: '#b685ff', borderColor: '#b685ff44' }}
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
                <span className="text-xs text-neutral-400 font-medium">Context update</span>
                <div className="flex gap-3">
                  <button
                    onClick={approveContextUpdate}
                    className="text-xs text-green-500 hover:text-green-400 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={dismissContextUpdate}
                    className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto max-h-48 px-4 pb-3">
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
            </div>
          )}

          <div className="px-3 pb-3 pt-2 border-t border-neutral-800 flex gap-2">
            <input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask something…"
              disabled={isLoading}
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-600 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={send}
              disabled={!inputValue.trim() || isLoading}
              className="px-3 py-2 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors disabled:opacity-40 text-sm"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
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
