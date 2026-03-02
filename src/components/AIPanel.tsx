import { useState, useEffect, useRef } from 'react'

interface AIPanelProps {
  onClose: () => void
  activeFile: string | null
  onContextUpdated: () => void
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}


export default function AIPanel({ onClose, activeFile, onContextUpdated }: AIPanelProps) {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [keyInput, setKeyInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [contextState, setContextState] = useState<null | 'loading' | 'review'>(null)
  const [contextDiff, setContextDiff] = useState<{ current: string; suggested: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const contextPromptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/keys')
      .then(r => r.json())
      .then(d => setHasKey(d.hasKey))
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

  async function saveKey(e: React.FormEvent) {
    e.preventDefault()
    if (!keyInput.trim()) return
    await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: keyInput.trim(), provider }),
    })
    setHasKey(true)
    setKeyInput('')
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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, filenames }),
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
        body: JSON.stringify({ messages }),
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <span className="text-sm font-medium text-neutral-200">Ask AI</span>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-300 transition-colors"
          aria-label="Close AI panel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {hasKey === null ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-neutral-600">Loading…</p>
        </div>
      ) : !hasKey ? (
        <form onSubmit={saveKey} className="flex-1 flex flex-col justify-center px-6 gap-4">
          <p className="text-sm text-neutral-300">Add your API key to start.</p>
          <div className="flex gap-2">
            {(['anthropic', 'openai'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`flex-1 py-1.5 rounded text-xs transition-colors ${
                  provider === p
                    ? 'bg-neutral-700 text-neutral-100'
                    : 'bg-neutral-900 text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
              </button>
            ))}
          </div>
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
        </form>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <p className="text-xs text-neutral-600 text-center mt-8">
                Ask anything about your open page.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-neutral-800 text-neutral-200' : 'text-neutral-300'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start">
                <div className="text-neutral-600 text-sm px-1">…</div>
              </div>
            )}
            {exchangeCount >= 3 && contextState === null && !isLoading && (
              <div ref={contextPromptRef} className="flex flex-col items-center gap-1.5 pt-1 pb-4">
                <button
                  onClick={suggestContextUpdate}
                  className="text-xs text-neutral-500 hover:text-neutral-300 border border-neutral-800 hover:border-neutral-600 rounded px-3 py-1.5 transition-colors"
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

          <div className="px-4 py-2 border-t border-neutral-800">
            <p className="text-xs text-neutral-600">
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
