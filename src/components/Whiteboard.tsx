import { useRef, useEffect, useState, useCallback } from 'react'
import { Tldraw, Editor, TLRecord, createShapeId, renderPlaintextFromRichText } from 'tldraw'
import { toRichText } from '@tldraw/tlschema'
import 'tldraw/tldraw.css'

const REACTIVE_MS = 4000
const REFLECTIVE_MS = 15000
const NEARBY_PX = 300

interface BrainstormAction {
  type: 'note' | 'question' | 'cluster-name'
  near: string | string[]
  text: string
}

interface ShapeData {
  id: string
  text: string
  x: number
  y: number
}

export default function Whiteboard() {
  const editorRef = useRef<Editor | null>(null)
  const reactiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reflectiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAiAction = useRef(false)
  const isBrainstorming = useRef(false)
  const aiShapeIds = useRef<Set<string>>(new Set())
  const processedShapeIds = useRef<Set<string>>(new Set())
  const providerRef = useRef<string>('')
  const ollamaModelRef = useRef<string>('')
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'))

  // Sync dark mode
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' })
    }
  }, [isDark])

  // Detect provider on mount
  useEffect(() => {
    fetch('/api/keys')
      .then(r => r.json())
      .then(d => {
        if (d.provider) providerRef.current = d.provider
        else if (d.hasOpenRouter) providerRef.current = 'openrouter'
        else if (d.hasAnthropic) providerRef.current = 'anthropic'
        else if (d.hasOpenAI) providerRef.current = 'openai'
        else if (d.hasOllama) providerRef.current = 'ollama'
        if (d.ollamaModels?.[0]) ollamaModelRef.current = d.ollamaModels[0]
      })
  }, [])

  function getUserShapes(): ShapeData[] {
    const editor = editorRef.current
    if (!editor) return []
    return editor.getCurrentPageShapes()
      .filter(s => (s.type === 'note' || s.type === 'text') && !aiShapeIds.current.has(s.id))
      .map(s => ({
        id: s.id,
        text: renderPlaintextFromRichText(editor, (s.props as { richText: Parameters<typeof renderPlaintextFromRichText>[1] }).richText),
        x: Math.round(s.x),
        y: Math.round(s.y),
      }))
      .filter(s => s.text.trim())
  }

  function findNearby(target: ShapeData, allShapes: ShapeData[]): ShapeData[] {
    return allShapes.filter(s =>
      s.id !== target.id &&
      Math.abs(s.x - target.x) < NEARBY_PX &&
      Math.abs(s.y - target.y) < NEARBY_PX
    )
  }

  function placeAction(action: BrainstormAction) {
    const editor = editorRef.current
    if (!editor) return

    const allShapes = editor.getCurrentPageShapes()

    isAiAction.current = true

    if (action.type === 'cluster-name' && Array.isArray(action.near)) {
      const refs = action.near
        .map(id => allShapes.find(s => s.id === id))
        .filter(Boolean) as typeof allShapes
      if (refs.length > 0) {
        const centerX = refs.reduce((sum, s) => sum + s.x, 0) / refs.length
        const minY = Math.min(...refs.map(s => s.y))
        const id = createShapeId()
        editor.createShape({
          id,
          type: 'text',
          x: centerX,
          y: minY - 80,
          props: { richText: toRichText(action.text), color: 'violet', scale: 1 },
        })
        aiShapeIds.current.add(id)
      }
    } else {
      const nearId = typeof action.near === 'string' ? action.near : action.near?.[0]
      const refShape = nearId ? allShapes.find(s => s.id === nearId) : null
      const x = refShape ? refShape.x + 300 : 400
      const y = refShape ? refShape.y : 200

      const id = createShapeId()
      editor.createShape({
        id,
        type: 'note',
        x,
        y,
        props: { richText: toRichText(action.text), color: 'violet' },
      })
      aiShapeIds.current.add(id)
    }

    setTimeout(() => { isAiAction.current = false }, 100)
  }

  const reactiveBrainstorm = useCallback(async () => {
    if (isBrainstorming.current) return
    const allUserShapes = getUserShapes()
    if (allUserShapes.length === 0) return

    // Find new shapes not yet processed
    const newShapes = allUserShapes.filter(s => !processedShapeIds.current.has(s.id))
    if (newShapes.length === 0) return

    // Mark as processed
    newShapes.forEach(s => processedShapeIds.current.add(s.id))

    // Get nearby context for the newest shape
    const focus = newShapes[newShapes.length - 1]
    const nearby = findNearby(focus, allUserShapes)

    isBrainstorming.current = true
    try {
      const res = await fetch('/api/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'reactive',
          focus: [{ id: focus.id, text: focus.text, x: focus.x, y: focus.y }],
          context: nearby.map(s => ({ id: s.id, text: s.text, x: s.x, y: s.y })),
          provider: providerRef.current,
          ollamaModel: ollamaModelRef.current || undefined,
        }),
      })
      const data = await res.json()
      if (data.actions?.[0]) placeAction(data.actions[0])
    } catch {
      // Silent
    } finally {
      isBrainstorming.current = false
    }
  }, [])

  const reflectiveBrainstorm = useCallback(async () => {
    if (isBrainstorming.current) return
    const allUserShapes = getUserShapes()
    if (allUserShapes.length < 2) return // Need at least 2 shapes for structural reasoning

    isBrainstorming.current = true
    try {
      const res = await fetch('/api/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'reflective',
          shapes: allUserShapes,
          provider: providerRef.current,
          ollamaModel: ollamaModelRef.current || undefined,
        }),
      })
      const data = await res.json()
      if (data.actions?.[0]) placeAction(data.actions[0])
    } catch {
      // Silent
    } finally {
      isBrainstorming.current = false
    }
  }, [])

  function handleMount(editor: Editor) {
    editorRef.current = editor
    editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' })

    editor.store.listen((entry) => {
      if (isAiAction.current) return

      const hasShapeChange = Object.values(entry.changes.added)
        .concat(Object.values(entry.changes.updated).map(([, after]) => after))
        .some((r: TLRecord) => r.typeName === 'shape')

      if (!hasShapeChange) return

      // Reset both timers on every user action
      if (reactiveTimer.current) clearTimeout(reactiveTimer.current)
      if (reflectiveTimer.current) clearTimeout(reflectiveTimer.current)

      reactiveTimer.current = setTimeout(reactiveBrainstorm, REACTIVE_MS)
      reflectiveTimer.current = setTimeout(reflectiveBrainstorm, REFLECTIVE_MS)
    })
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Tldraw onMount={handleMount} />
    </div>
  )
}
