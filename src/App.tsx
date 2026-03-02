import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'
import AIPanel from './components/AIPanel'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [activeContent, setActiveContent] = useState<string>('')

  const loadFiles = useCallback(async () => {
    const res = await fetch('/api/files')
    const data = await res.json()
    setFiles(data.files)
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const openFile = useCallback(async (filename: string) => {
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
    await loadFiles()
    if (activeFile === filename) {
      setActiveFile(null)
      setActiveContent('')
    }
  }, [activeFile, loadFiles])

  const saveFile = useCallback(async (content: string) => {
    if (!activeFile) return
    setActiveContent(content)
    await fetch(`/api/files/${encodeURIComponent(activeFile)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  }, [activeFile])

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
    <div className="flex h-screen bg-neutral-950 text-neutral-200 overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        files={files}
        activeFile={activeFile}
        onOpenFile={openFile}
        onCreateFile={createFile}
        onDeleteFile={deleteFile}
      />
      <Canvas
        onOpenAI={() => setAiPanelOpen(o => !o)}
        filename={activeFile}
        content={activeContent}
        onSave={saveFile}
        onRename={renameFile}
      />
      {aiPanelOpen && (
        <AIPanel
          onClose={() => setAiPanelOpen(false)}
          activeFile={activeFile}
          onContextUpdated={() => { if (activeFile === 'CONTEXT.md') openFile('CONTEXT.md') }}
        />
      )}
    </div>
  )
}
