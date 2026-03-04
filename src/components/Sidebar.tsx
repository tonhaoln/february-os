interface SidebarProps {
  open: boolean
  onToggle: () => void
  files: string[]
  activeFile: string | null
  onOpenFile: (filename: string) => void
  onCreateFile: () => void
  onDeleteFile: (filename: string) => void
}

function stripMd(filename: string) {
  return filename.replace(/\.md$/, '')
}

export default function Sidebar({
  open, onToggle, files, activeFile, onOpenFile, onCreateFile, onDeleteFile
}: SidebarProps) {
  const pages = files.filter(f => f !== 'CONTEXT.md')

  return (
    <>
      {open && (
        <aside className="w-60 flex-shrink-0 flex flex-col border-r border-neutral-800 bg-neutral-950">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-11 flex-shrink-0 border-b border-neutral-800">
            <span className="text-sm font-medium text-neutral-200">February</span>
            <button
              onClick={onToggle}
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
              aria-label="Collapse sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Your context — always pinned */}
          <div className="px-3 pt-3">
            <button
              onClick={() => onOpenFile('CONTEXT.md')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors group ${
                activeFile === 'CONTEXT.md'
                  ? 'bg-neutral-800'
                  : 'hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-neutral-500 group-hover:text-neutral-300 flex-shrink-0">
                <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M4 5h6M4 7h6M4 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span className="text-sm" style={{ color: activeFile === 'CONTEXT.md' ? '#b685ff' : undefined }}>Your context</span>
            </button>
          </div>

          {/* Divider */}
          <div className="mx-3 my-2 border-t border-neutral-800" />

          {/* Page tree */}
          <div className="flex-1 overflow-y-auto px-3">
            {pages.length === 0 ? (
              <p className="px-2 text-xs text-neutral-600">No pages yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {pages.map(file => (
                  <li key={file}>
                    <div className={`group flex items-center rounded transition-colors ${
                      activeFile === file ? 'bg-neutral-800' : 'hover:bg-neutral-800'
                    }`}>
                      <button
                        onClick={() => onOpenFile(file)}
                        className="flex-1 px-2 py-1.5 text-left text-sm truncate"
                        style={{ color: activeFile === file ? '#b685ff' : undefined }}
                      >
                        {stripMd(file)}
                      </button>
                      <button
                        onClick={() => onDeleteFile(file)}
                        className="pr-2 text-neutral-700 hover:text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        aria-label={`Delete ${file}`}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* New page */}
          <div className="px-3 pb-3 pt-2 border-t border-neutral-800">
            <button
              onClick={onCreateFile}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors text-sm"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              New page
            </button>
          </div>
        </aside>
      )}

      {/* Collapsed toggle */}
      {!open && (
        <button
          onClick={onToggle}
          className="w-8 flex-shrink-0 flex items-center justify-center border-r border-neutral-800 hover:bg-neutral-900 transition-colors text-neutral-500 hover:text-neutral-300"
          aria-label="Expand sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </>
  )
}
