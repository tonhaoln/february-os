# February — Claude Instructions

## What this project is
A local-first interface for externalising context. Markdown files, Git versioning underneath, any AI can read them. The compounding stays yours.

Not a writing tool. Not a Notion clone. Not a memory app. Those are consequences of the interface, not the point.

---

## Stack — do not deviate
- Runtime: Node.js
- Backend: Express
- Frontend: React + Vite
- Editor: Tiptap v2
- Git: simple-git
- Styling: Tailwind
- Language: TypeScript
- AI providers: Vercel AI SDK
- One command: `npm start`

**Never suggest:** Electron, Tauri, Next.js, SvelteKit, SQLite, Docker, isomorphic-git, or any framework that adds distribution complexity or violates the one-command constraint.

---

## Engineering principles
- Lean over complete
- Working over polished
- Simple over extensible
- Minimum complexity needed for the thing to work
- No over-engineering
- No backwards-compatibility hacks
- No error handling for scenarios that can't happen
- No helpers or abstractions for one-time operations
- Files are the database — no SQLite, no graph layer. This holds for v1 without exception.

---

## Communication style
- Short and direct
- No padding
- Genuine pushback over agreement
- Challenge assumptions when warranted
- No emojis unless asked
