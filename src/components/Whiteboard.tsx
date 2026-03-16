import { useRef, useEffect, useState, useMemo } from 'react'
import { Tldraw, Editor } from 'tldraw'
import 'tldraw/tldraw.css'

export default function Whiteboard() {
  const editorRef = useRef<Editor | null>(null)
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'))

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

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Tldraw onMount={(editor) => {
        editorRef.current = editor
        editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' })
      }} />
    </div>
  )
}
