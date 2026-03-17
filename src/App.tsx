import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'
import AIPanel from './components/AIPanel'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(560)
  const dragStartRef = useRef<{ x: number; w: number } | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [activeContent, setActiveContent] = useState<string>('')
  const [mode, setMode] = useState<'editor' | 'canvas'>('editor')

  // Theme: system default, manual override via localStorage
  useEffect(() => {
    const saved = localStorage.getItem('february-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved ? saved === 'dark' : prefersDark
    document.documentElement.classList.toggle('dark', isDark)

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('february-theme')) {
        document.documentElement.classList.toggle('dark', e.matches)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', !isDark)
    localStorage.setItem('february-theme', isDark ? 'light' : 'dark')
  }

  const loadFiles = useCallback(async () => {
    const res = await fetch('/api/files')
    const data = await res.json()
    setFiles(data.files)
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const openFile = useCallback(async (filename: string) => {
    setMode('editor')
    const res = await fetch(`/api/files/${encodeURIComponent(filename)}`)
    const data = await res.json()
    setActiveFile(filename)
    setActiveContent(data.content)
  }, [])

  const createFile = useCallback(async () => {
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled' }),
    })
    const data = await res.json()
    await loadFiles()
    await openFile(data.filename)
  }, [loadFiles, openFile])

  const deleteFile = useCallback(async (filename: string) => {
    await fetch(`/api/files/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    if (activeFile === filename) {
      setActiveFile(null)
      setActiveContent('')
    }
    await loadFiles()
  }, [activeFile, loadFiles])

  const saveFile = useCallback(async (content: string) => {
    if (!activeFile) return
    await fetch(`/api/files/${encodeURIComponent(activeFile)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  }, [activeFile])

  function startDrag(e: React.MouseEvent) {
    dragStartRef.current = { x: e.clientX, w: panelWidth }
    function onMove(e: MouseEvent) {
      if (!dragStartRef.current) return
      const delta = dragStartRef.current.x - e.clientX
      setPanelWidth(Math.min(590, Math.max(290, dragStartRef.current.w + delta)))
    }
    function onUp() {
      dragStartRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleExpand() {
    setPanelWidth(w => w < 590 ? 590 : 560)
  }

  const renameFile = useCallback(async (newName: string) => {
    if (!activeFile) return
    const res = await fetch(`/api/files/${encodeURIComponent(activeFile)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName }),
    })
    const data = await res.json()
    await loadFiles()
    setActiveFile(data.filename)
  }, [activeFile, loadFiles])

  return (
    <div className="flex h-screen bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        files={files}
        activeFile={activeFile}
        onOpenFile={openFile}
        onCreateFile={createFile}
        onDeleteFile={deleteFile}
        onToggleTheme={toggleTheme}
      />
      <Canvas
        onOpenAI={() => setAiPanelOpen(o => !o)}
        aiPanelOpen={aiPanelOpen}
        filename={activeFile}
        content={activeContent}
        onSave={saveFile}
        onRename={renameFile}
        mode={mode}
        onModeChange={(m: 'editor' | 'canvas') => { setMode(m); if (m === 'canvas') setAiPanelOpen(false) }}
        onEndSession={async (filename: string) => { await loadFiles(); await openFile(filename) }}
      />
      <AIPanel
        open={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        panelWidth={panelWidth}
        onDragStart={startDrag}
        onExpand={handleExpand}
        activeFile={activeFile}
        onContextUpdated={() => { if (activeFile === 'CONTEXT.md') openFile('CONTEXT.md') }}
      />
    </div>
  )
}
