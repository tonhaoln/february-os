import { useRef, useEffect, useState, useCallback } from 'react'
import { Tldraw, Editor, TLRecord, createShapeId, renderPlaintextFromRichText } from 'tldraw'
import { toRichText } from '@tldraw/tlschema'
import 'tldraw/tldraw.css'

const REACTIVE_MS = 4000
const REFLECTIVE_MS = 15000
const NEARBY_PX = 300
const CURSOR_MOVE_MS = 900
const CURSOR_PAUSE_MS = 500
const IDLE_DRIFT_MIN_MS = 8000
const IDLE_DRIFT_MAX_MS = 12000
const SLEEP_AFTER_MS = 30000

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
  const idleDriftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAiAction = useRef(false)
  const isBrainstorming = useRef(false)
  const aiShapeIds = useRef<Set<string>>(new Set())
  const processedShapeIds = useRef<Set<string>>(new Set())
  const processedTexts = useRef<Set<string>>(new Set())
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const providerRef = useRef<string>('')
  const ollamaModelRef = useRef<string>('')
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'))
  const [cursorPos, setCursorPos] = useState({ x: 80, y: 80 })
  const [cursorVisible, setCursorVisible] = useState(true)
  const [isSleeping, setIsSleeping] = useState(false)

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
      .filter((s, i, arr) => arr.findIndex(a => a.text.trim().toLowerCase() === s.text.trim().toLowerCase()) === i)
  }

  function findNearby(target: ShapeData, allShapes: ShapeData[]): ShapeData[] {
    return allShapes.filter(s =>
      s.id !== target.id &&
      Math.abs(s.x - target.x) < NEARBY_PX &&
      Math.abs(s.y - target.y) < NEARBY_PX
    )
  }

  function animateCursor(pageX: number, pageY: number): Promise<void> {
    const editor = editorRef.current
    if (!editor) return Promise.resolve()
    const vp = editor.pageToViewport({ x: pageX, y: pageY })
    setCursorPos({ x: vp.x, y: vp.y })
    return new Promise(resolve => setTimeout(resolve, CURSOR_MOVE_MS + CURSOR_PAUSE_MS))
  }

  async function placeAction(action: BrainstormAction) {
    const editor = editorRef.current
    if (!editor) return

    const allShapes = editor.getCurrentPageShapes()

    if (action.type === 'cluster-name' && Array.isArray(action.near)) {
      const refs = action.near
        .map(id => allShapes.find(s => s.id === id))
        .filter(Boolean) as typeof allShapes
      if (refs.length > 0) {
        const centerX = refs.reduce((sum, s) => sum + s.x, 0) / refs.length
        const minY = Math.min(...refs.map(s => s.y))
        const targetX = centerX
        const targetY = minY - 80

        await animateCursor(targetX, targetY)

        isAiAction.current = true
        const id = createShapeId()
        editor.createShape({
          id,
          type: 'text',
          x: targetX,
          y: targetY,
          props: { richText: toRichText(action.text), color: 'violet', scale: 1 },
        })
        aiShapeIds.current.add(id)
        setTimeout(() => { isAiAction.current = false }, 100)
      }
    } else {
      const nearId = typeof action.near === 'string' ? action.near : action.near?.[0]
      const refShape = nearId ? allShapes.find(s => s.id === nearId) : null
      let targetX = refShape ? refShape.x + 300 : 400
      let targetY = refShape ? refShape.y : 200

      // Offset if another shape is already near this position
      const OVERLAP_THRESHOLD = 50
      let attempts = 0
      while (attempts < 5 && allShapes.some(s =>
        Math.abs(s.x - targetX) < OVERLAP_THRESHOLD && Math.abs(s.y - targetY) < OVERLAP_THRESHOLD
      )) {
        targetX += 150
        targetY += 100
        attempts++
      }

      await animateCursor(targetX, targetY)

      isAiAction.current = true
      const id = createShapeId()
      editor.createShape({
        id,
        type: 'note',
        x: targetX,
        y: targetY,
        props: { richText: toRichText(action.text), color: 'violet' },
      })
      aiShapeIds.current.add(id)
      setTimeout(() => { isAiAction.current = false }, 100)
    }
  }

  const reactiveBrainstorm = useCallback(async () => {
    if (isBrainstorming.current) return
    const allUserShapes = getUserShapes()
    if (allUserShapes.length === 0) return

    const newShapes = allUserShapes.filter(s =>
      !processedShapeIds.current.has(s.id) && !processedTexts.current.has(s.text.trim().toLowerCase())
    )
    if (newShapes.length === 0) return

    newShapes.forEach(s => {
      processedShapeIds.current.add(s.id)
      processedTexts.current.add(s.text.trim().toLowerCase())
    })

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
      if (data.actions?.[0]) await placeAction(data.actions[0])
    } catch {
      // Silent
    } finally {
      isBrainstorming.current = false
    }
  }, [])

  const reflectiveBrainstorm = useCallback(async () => {
    if (isBrainstorming.current) return
    const allUserShapes = getUserShapes()
    if (allUserShapes.length < 2) return

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
      if (data.actions?.[0]) await placeAction(data.actions[0])
    } catch {
      // Silent
    } finally {
      isBrainstorming.current = false
    }
  }, [])

  function scheduleIdleDrift() {
    if (idleDriftTimer.current) clearTimeout(idleDriftTimer.current)
    const delay = IDLE_DRIFT_MIN_MS + Math.random() * (IDLE_DRIFT_MAX_MS - IDLE_DRIFT_MIN_MS)
    idleDriftTimer.current = setTimeout(() => {
      if (isBrainstorming.current || isSleeping) {
        if (!isSleeping) scheduleIdleDrift()
        return
      }
      const editor = editorRef.current
      if (!editor) return
      const userShapes = getUserShapes()
      if (userShapes.length === 0) {
        scheduleIdleDrift()
        return
      }
      const target = userShapes[Math.floor(Math.random() * userShapes.length)]
      const vp = editor.pageToViewport({ x: target.x, y: target.y - 30 })
      setCursorPos({ x: vp.x, y: vp.y })
      scheduleIdleDrift()
    }, delay)
  }

  function wakeUp() {
    setIsSleeping(false)
    if (sleepTimer.current) clearTimeout(sleepTimer.current)
    sleepTimer.current = setTimeout(() => {
      setIsSleeping(true)
      if (idleDriftTimer.current) clearTimeout(idleDriftTimer.current)
    }, SLEEP_AFTER_MS)
    scheduleIdleDrift()
  }

  function handleMount(editor: Editor) {
    editorRef.current = editor
    editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' })
    setCursorVisible(true)

    // Start awake — idle drift + sleep timer
    wakeUp()

    editor.store.listen((entry) => {
      if (isAiAction.current) return

      const hasShapeChange = Object.values(entry.changes.added)
        .concat(Object.values(entry.changes.updated).map(([, after]) => after))
        .some((r: TLRecord) => r.typeName === 'shape')

      if (!hasShapeChange) return

      // Wake up on user activity
      wakeUp()

      if (reactiveTimer.current) clearTimeout(reactiveTimer.current)
      if (reflectiveTimer.current) clearTimeout(reflectiveTimer.current)

      reactiveTimer.current = setTimeout(reactiveBrainstorm, REACTIVE_MS)
      reflectiveTimer.current = setTimeout(reflectiveBrainstorm, REFLECTIVE_MS)
    })
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Tldraw onMount={handleMount} />

      {/* AI cursor overlay */}
      {cursorVisible && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translate(${cursorPos.x}px, ${cursorPos.y}px)`,
            transition: `transform ${CURSOR_MOVE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
            pointerEvents: 'none',
            zIndex: 999,
          }}
        >
          <img
            src="/avatar.png"
            alt="February AI"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              boxShadow: `0 0 0 3px ${isDark ? 'rgba(182, 133, 255, 0.35)' : 'rgba(139, 92, 246, 0.3)'}, 0 0 12px ${isDark ? 'rgba(182, 133, 255, 0.15)' : 'rgba(139, 92, 246, 0.15)'}`,
            }}
          />
          {isSleeping && (
            <span
              style={{
                position: 'absolute',
                top: -12,
                right: -18,
                fontSize: 13,
                fontWeight: 600,
                fontStyle: 'italic',
                color: isDark ? '#b685ff' : '#8b5cf6',
                opacity: 0.7,
                fontFamily: 'system-ui, sans-serif',
                letterSpacing: 1,
              }}
            >
              zzz
            </span>
          )}
          <span
            style={{
              display: 'block',
              fontSize: 10,
              marginTop: 2,
              whiteSpace: 'nowrap',
              color: isDark ? '#b685ff' : '#8b5cf6',
              fontFamily: 'system-ui, sans-serif',
              opacity: isSleeping ? 0.4 : 1,
              transition: 'opacity 0.5s',
            }}
          >
            February
          </span>
        </div>
      )}
    </div>
  )
}
