# February — Claude Instructions

## What this project is
A local-first interface for externalising context. Markdown files, Git versioning underneath, any AI can read them. The compounding stays yours.

Not a writing tool. Not a Notion clone. Not a memory app. Those are consequences of the interface, not the point.

---

## Who's building this
Product designer, not a full-stack developer. The job is figuring out what to build and why. When building stopped being the bottleneck, that became the harder skill.

**North star:** "I figure out what should get built — then I build it."

This is a marathon, not a sprint.

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

## Build order — do not skip steps
1. Editor spike — Tiptap markdown round-trip ✅
2. Shell — `npm start` → browser → content folder → CONTEXT.md pre-populated
3. File system — read/write, page tree
4. Git integration — silent auto-commit, debounced 2s
5. AI panel — context selection, Claude/OpenAI via Vercel AI SDK
6. CONTEXT.md integration — always loaded, closing loop

Each step has a pass condition. Nothing moves forward until the current step passes.

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

## Git and push rules
Push when there's something a reader can learn from: working code, documented decisions, an updated README. Not spikes, not drafts, not progress updates.

Spikes are throwaway — they prove a bet, then get left alone. The product repo stays clean.

The shell (Step 2) is the first real push.

---

## Docs live locally
`docs/` is gitignored. Thinking stays local. The README is the public front door. Posts are the public narrative.

---

## Communication style
- Short and direct
- No padding
- Genuine pushback over agreement
- Challenge assumptions when warranted
- No emojis unless asked
