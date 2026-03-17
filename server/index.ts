import 'dotenv/config'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import simpleGit from 'simple-git'
import { streamText, generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai, createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CONTENT_DIR = path.join(ROOT, 'content')
const CONTEXT_FILE = path.join(CONTENT_DIR, 'CONTEXT.md')
const ENV_FILE = path.join(ROOT, '.env')

const CONTEXT_TEMPLATE = `# Context

## What this is
[Describe this workspace — what it's for, what kind of thinking lives here.]

## Current focus
[What are you working on right now? What should the AI prioritise?]

## Background
[Decisions made, constraints, things the AI should always know.]

## How to use this file
Update this at the end of sessions. The more accurate it is, the more useful the next session will be.
`

function ensureContentDir() {
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true })
    console.log('Created ./content/')
  }
  if (!fs.existsSync(CONTEXT_FILE)) {
    fs.writeFileSync(CONTEXT_FILE, CONTEXT_TEMPLATE, 'utf-8')
    console.log('Created ./content/CONTEXT.md')
  }
}

async function ensureGit() {
  const hasGitDir = fs.existsSync(path.join(CONTENT_DIR, '.git'))
  if (!hasGitDir) {
    const git = simpleGit(CONTENT_DIR)
    await git.init(['-b', 'main'])
    await git.addConfig('user.name', 'February')
    await git.addConfig('user.email', 'february@local')
    console.log('Initialised git in ./content/')
  }
}

function isValidFilename(filename: string): boolean {
  return (
    filename.endsWith('.md') &&
    !filename.includes('/') &&
    !filename.includes('..') &&
    filename.length > 3
  )
}

function uniqueFilename(base: string): string {
  let filename = `${base}.md`
  if (!fs.existsSync(path.join(CONTENT_DIR, filename))) return filename
  let counter = 2
  while (fs.existsSync(path.join(CONTENT_DIR, `${base} ${counter}.md`))) {
    counter++
  }
  return `${base} ${counter}.md`
}

async function commitFile(filename: string) {
  try {
    const title = filename.replace(/\.md$/, '')
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const git = simpleGit(CONTENT_DIR)
    await git.add(filename)
    await git.commit(`${title} — ${timestamp}`)
  } catch {
    // Nothing to commit or git not ready — silent
  }
}

function writeEnvKey(provider: string, key: string) {
  const varName = provider === 'anthropic'
    ? 'ANTHROPIC_API_KEY'
    : provider === 'openai'
    ? 'OPENAI_API_KEY'
    : 'OPENROUTER_API_KEY'
  let contents = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : ''
  const regex = new RegExp(`^${varName}=.*$`, 'm')
  if (regex.test(contents)) {
    contents = contents.replace(regex, `${varName}=${key}`)
  } else {
    contents = contents.trimEnd() + (contents ? '\n' : '') + `${varName}=${key}\n`
  }
  fs.writeFileSync(ENV_FILE, contents, 'utf-8')
  // Update in memory immediately
  process.env[varName] = key
}

async function detectOllama(): Promise<{ available: boolean; models: string[] }> {
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    if (!res.ok) return { available: false, models: [] }
    const data = await res.json() as { models?: { name: string }[] }
    return { available: true, models: data.models?.map(m => m.name) ?? [] }
  } catch {
    return { available: false, models: [] }
  }
}

function selectModel(requestedProvider: string, ollamaModel?: string) {
  if (requestedProvider === 'ollama') {
    const ollamaOpenAI = createOpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' })
    return ollamaOpenAI(ollamaModel ?? 'llama3.2')
  }
  if (requestedProvider === 'openrouter') {
    const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY ?? '' })
    return openrouter('openrouter/auto')
  }
  const useAnthropic = requestedProvider === 'anthropic'
    ? !!process.env.ANTHROPIC_API_KEY
    : requestedProvider === 'openai'
    ? false
    : !!process.env.ANTHROPIC_API_KEY
  return useAnthropic ? anthropic('claude-sonnet-4-6') : openai('gpt-4o')
}

async function detectProvider(): Promise<{ provider: string; ollamaModel?: string }> {
  if (process.env.OPENROUTER_API_KEY) return { provider: 'openrouter' }
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic' }
  if (process.env.OPENAI_API_KEY) return { provider: 'openai' }
  const ollama = await detectOllama()
  if (ollama.available && ollama.models.length > 0) return { provider: 'ollama', ollamaModel: ollama.models[0] }
  return { provider: 'anthropic' }
}

ensureContentDir()

const app = express()
app.use(express.json())

// --- File routes ---

app.get('/api/files', (_req, res) => {
  const files = fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
  res.json({ files })
})

app.get('/api/files/:filename', (req, res) => {
  const { filename } = req.params
  if (!isValidFilename(filename)) return res.status(400).json({ error: 'Invalid filename' })
  const filepath = path.join(CONTENT_DIR, filename)
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' })
  const content = fs.readFileSync(filepath, 'utf-8')
  res.json({ content })
})

app.post('/api/files', (req, res) => {
  const raw: string = (req.body.name ?? 'Untitled').trim()
  const base = raw.replace(/[^a-zA-Z0-9 \-]/g, '').trim() || 'Untitled'
  const filename = uniqueFilename(base)
  fs.writeFileSync(path.join(CONTENT_DIR, filename), '', 'utf-8')
  res.json({ filename })
})

app.put('/api/files/:filename', async (req, res) => {
  const { filename } = req.params
  if (!isValidFilename(filename)) return res.status(400).json({ error: 'Invalid filename' })
  const filepath = path.join(CONTENT_DIR, filename)
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' })
  fs.writeFileSync(filepath, req.body.content ?? '', 'utf-8')
  await commitFile(filename)
  res.json({ ok: true })
})

app.patch('/api/files/:filename', (req, res) => {
  const { filename } = req.params
  if (!isValidFilename(filename)) return res.status(400).json({ error: 'Invalid filename' })
  if (filename === 'CONTEXT.md') return res.status(403).json({ error: 'Cannot rename your context' })
  const raw: string = (req.body.newName ?? '').trim()
  const base = raw.replace(/[^a-zA-Z0-9 \-]/g, '').trim() || 'Untitled'
  const newFilename = uniqueFilename(base)
  const oldPath = path.join(CONTENT_DIR, filename)
  const newPath = path.join(CONTENT_DIR, newFilename)
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Not found' })
  fs.renameSync(oldPath, newPath)
  res.json({ filename: newFilename })
})

app.delete('/api/files/:filename', (req, res) => {
  const { filename } = req.params
  if (!isValidFilename(filename)) return res.status(400).json({ error: 'Invalid filename' })
  if (filename === 'CONTEXT.md') return res.status(403).json({ error: 'Cannot delete your context' })
  const filepath = path.join(CONTENT_DIR, filename)
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' })
  fs.unlinkSync(filepath)
  res.json({ ok: true })
})

// --- Key routes ---

app.get('/api/keys', async (_req, res) => {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY
  const ollama = await detectOllama()
  const provider = hasOpenRouter ? 'openrouter' : hasAnthropic ? 'anthropic' : hasOpenAI ? 'openai' : null
  res.json({ hasKey: !!provider, provider, hasAnthropic, hasOpenAI, hasOpenRouter, hasOllama: ollama.available, ollamaModels: ollama.models })
})

app.post('/api/keys', (req, res) => {
  const { key, provider } = req.body
  if (!key || !provider) return res.status(400).json({ error: 'Missing key or provider' })
  writeEnvKey(provider, key)
  res.json({ ok: true })
})

app.delete('/api/keys/:provider', (req, res) => {
  const { provider } = req.params
  const varName = provider === 'anthropic'
    ? 'ANTHROPIC_API_KEY'
    : provider === 'openai'
    ? 'OPENAI_API_KEY'
    : 'OPENROUTER_API_KEY'
  let contents = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : ''
  contents = contents.replace(new RegExp(`^${varName}=.*\\n?`, 'm'), '')
  fs.writeFileSync(ENV_FILE, contents, 'utf-8')
  delete process.env[varName]
  res.json({ ok: true })
})

// --- Chat route ---

app.post('/api/chat', async (req, res) => {
  const { messages, filenames, provider: requestedProvider, ollamaModel } = req.body

  const fileList: string[] = ['CONTEXT.md', ...(filenames ?? [])].filter(
    (f, i, arr) => arr.indexOf(f) === i // dedupe
  )

  const systemParts = fileList
    .filter(f => isValidFilename(f) && fs.existsSync(path.join(CONTENT_DIR, f)))
    .map(f => {
      const content = fs.readFileSync(path.join(CONTENT_DIR, f), 'utf-8')
      return `## ${f}\n\n${content}`
    })
  const system = [
    'You have access to the following files from the user\'s workspace. Answer questions using this content directly — do not say you cannot read files.',
    ...systemParts,
  ].join('\n\n---\n\n')

  const model = selectModel(requestedProvider, ollamaModel)

  try {
    const result = streamText({ model, system, messages })
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')
    for await (const chunk of result.textStream) {
      res.write(chunk)
    }
    res.end()
  } catch (err) {
    res.status(500).json({ error: 'AI request failed' })
  }
})

// --- Context suggest route ---

app.post('/api/context-suggest', async (req, res) => {
  const { messages, provider: requestedProvider, ollamaModel } = req.body
  const current = fs.existsSync(CONTEXT_FILE) ? fs.readFileSync(CONTEXT_FILE, 'utf-8') : ''

  const model = selectModel(requestedProvider, ollamaModel)

  const conversationText = (messages as { role: string; content: string }[])
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  const prompt = `Here is the user's current CONTEXT.md:\n\n${current}\n\n---\n\nHere is a recent conversation:\n\n${conversationText}\n\n---\n\nRewrite CONTEXT.md to accurately represent where this person is right now. Supersede decisions that have evolved, remove what is no longer current, update what has changed. Do not just append new information — replace old information with new where relevant. The file should read as a sharp, present-tense document, not a growing transcript. Return only the full updated file content — no explanation, no markdown wrapper, no code fences.`

  try {
    const result = await generateText({ model, prompt })
    res.json({ current, suggested: result.text })
  } catch {
    res.status(500).json({ error: 'AI request failed' })
  }
})

// --- Brainstorm route ---

function groupByProximity(shapes: { id: string; text: string; x: number; y: number }[], threshold = 300) {
  const groups: typeof shapes[] = []
  const visited = new Set<string>()
  for (const shape of shapes) {
    if (visited.has(shape.id)) continue
    const cluster = [shape]
    visited.add(shape.id)
    for (const other of shapes) {
      if (visited.has(other.id)) continue
      if (Math.abs(other.x - shape.x) < threshold && Math.abs(other.y - shape.y) < threshold) {
        cluster.push(other)
        visited.add(other.id)
      }
    }
    groups.push(cluster)
  }
  return groups
}

app.post('/api/brainstorm', async (req, res) => {
  const { mode, shapes, focus, context: nearbyContext, provider: requestedProvider, ollamaModel } = req.body

  const detected = await detectProvider()
  const provider = requestedProvider || detected.provider
  const model = selectModel(provider, ollamaModel || detected.ollamaModel)

  const contextFile = fs.existsSync(CONTEXT_FILE) ? fs.readFileSync(CONTEXT_FILE, 'utf-8').trim() : ''

  const formatShape = (s: { id: string; text: string; x: number; y: number }) =>
    `- id="${s.id}" text="${s.text}" xy=(${s.x},${s.y})`

  // Shared identity — consistent across all modes
  const preamble = `You are February's canvas agent. You observe a user's brainstorming canvas and illuminate what's already there but unseen.

Your role: facilitator, not participant. You don't add ideas. You name patterns, surface connections, and point out gaps.

Identity:
- You are a spatial reasoning partner. Position on the canvas is meaning.
- You are opinionated. Commit to a perspective. No hedging: no "might," "could," "perhaps."
- You are quiet by default. Silence is your most common response.
- You reason about ideas, never about the board itself (duplicates, formatting, layout).
- One sentence max when you speak. Sharp, specific, referencing concrete notes.
${contextFile ? `\nThe user's context:\n${contextFile}\n` : ''}`

  // Synthesis mode — handle separately, different output format
  if (mode === 'synthesis') {
    const { userNotes, aiNotes } = req.body
    if (!userNotes || !Array.isArray(userNotes) || userNotes.length === 0) {
      return res.json({ markdown: '' })
    }

    const userList = userNotes.map((n: string, i: number) => `${i + 1}. ${n}`).join('\n')
    const aiList = aiNotes?.length ? aiNotes.map((n: string, i: number) => `${i + 1}. ${n}`).join('\n') : 'None'

    const synthesisPrompt = `You are producing a session synthesis for a brainstorming canvas. The user's notes are the authority — preserve them exactly. Your job is to add structure around them.
${contextFile ? `\nThe user's context:\n${contextFile}\n` : ''}
User's notes (in order they were created):
${userList}

AI observations made during the session:
${aiList}

Produce a markdown document with these exact sections:

## What you were thinking about
[One sentence distilling the core topic from the user's notes]

## Your notes
[List the user's notes exactly as written, as bullet points]

## Themes
[Name 2-4 clusters you see in the notes. For each: a 2-4 word theme label, then the notes that belong to it]

## Connections
[1-3 non-obvious relationships between notes. Be specific — reference actual notes.]

## Open questions
[1-3 things left unresolved or unexplored]

## What the AI observed
[Summarise the AI's contributions during the session in 2-3 sentences — contextualised, not a raw list]

Rules:
- Never modify the user's notes. Quote them exactly.
- Themes should be 2-4 words, not sentences.
- If there aren't enough notes for meaningful themes, skip that section.

Return ONLY the markdown. No explanation, no code fences.`

    try {
      const result = await generateText({ model, prompt: synthesisPrompt, temperature: 0.5 })
      return res.json({ markdown: result.text })
    } catch {
      return res.json({ markdown: '' })
    }
  }

  let prompt: string

  if (mode === 'reactive') {
    if (!focus || !Array.isArray(focus) || focus.length === 0) {
      return res.json({ actions: [] })
    }
    const focusText = focus.map(formatShape).join('\n')
    const nearbyText = nearbyContext?.length ? `\nNearby notes:\n${nearbyContext.map(formatShape).join('\n')}` : '\nNearby notes: None'

    prompt = `${preamble}
Mode: A new note was just added.

New note:
${focusText}
${nearbyText}

If this note is self-explanatory or too early to reason about, return [].

Examples:

User added: "Need offline mode" near "PWA support", "Local storage"
[{"type":"note","near":"shape:abc","text":"These three define the offline architecture — that's a buildable scope."}]

User added: "Budget: $40k" with no nearby notes
[{"type":"note","near":"shape:def","text":"First constraint on the board. Everything above changes shape now."}]

User added: "Use React" near "Vue considered", "Angular tried"
[{"type":"question","near":"shape:xyz","text":"Three frameworks explored — what made you keep coming back to React?"}]

User added: "Dark mode" with no nearby notes
[]

User added: "Users drop off at checkout" near "3-step form", "No guest checkout"
[{"type":"question","near":"shape:ghi","text":"Is the 3-step form the bottleneck, or is it the missing guest option?"}]

Return ONLY a JSON array. No explanation.`
  } else {
    if (!shapes || !Array.isArray(shapes) || shapes.length === 0) {
      return res.json({ actions: [] })
    }

    const clusters = groupByProximity(shapes)
    let canvasState = ''
    let clusterIndex = 0
    for (const cluster of clusters) {
      if (cluster.length >= 3) {
        const avgX = Math.round(cluster.reduce((s, c) => s + c.x, 0) / cluster.length)
        const avgY = Math.round(cluster.reduce((s, c) => s + c.y, 0) / cluster.length)
        canvasState += `\nCluster ${String.fromCharCode(65 + clusterIndex)} (${cluster.length} notes, near ${avgX},${avgY}):\n`
        canvasState += cluster.map(formatShape).join('\n')
        clusterIndex++
      } else if (cluster.length === 2) {
        canvasState += `\nPair (near ${cluster[0].x},${cluster[0].y}):\n`
        canvasState += cluster.map(formatShape).join('\n')
      } else {
        canvasState += `\nIsolated:\n${formatShape(cluster[0])}`
      }
    }

    prompt = `${preamble}
Mode: The user has paused. Observe the full board.

Canvas state (grouped by spatial proximity):
${canvasState}

Response priority (pick the FIRST that applies):
1. An unnamed cluster exists (3+ related notes grouped together) → Name the theme (2-4 words, the essence)
2. Two distant notes are connected but the user hasn't linked them → Surface the connection
3. A clear gap exists in an otherwise complete cluster → Point it out
4. Nothing non-obvious → Return []

Examples:

Canvas has 3 notes clustered: "Silent Git commits", "Auto-save", "Version history"
[{"type":"cluster-name","near":["shape:a","shape:b","shape:c"],"text":"Invisible versioning"}]

Canvas has "User onboarding" far from "Churn analysis" — both about retention
[{"type":"note","near":"shape:d","text":"Onboarding and churn are the same problem from opposite ends."}]

Canvas has 2 notes: "Use TypeScript", "Add linting"
[]

Canvas has 5 scattered unrelated notes, no clusters
[]

Canvas has cluster "Auth flow" (login, signup, reset) but no mention of sessions
[{"type":"question","near":"shape:e","text":"Auth flow is complete except session management — intentional?"}]

Return ONLY a JSON array. No explanation.`
  }

  try {
    const result = await generateText({ model, prompt, temperature: 0.7, topP: 0.9 })
    const cleaned = result.text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
    const actions = cleaned === '[]' ? [] : JSON.parse(cleaned)
    res.json({ actions: Array.isArray(actions) ? actions.slice(0, 1) : [] })
  } catch {
    res.json({ actions: [] })
  }
})

// --- Improve route ---

app.post('/api/improve', async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'Missing text' })

  const { provider, ollamaModel } = await detectProvider()
  const model = selectModel(provider, ollamaModel)

  const context = fs.existsSync(CONTEXT_FILE) ? fs.readFileSync(CONTEXT_FILE, 'utf-8').trim() : ''
  const contextSection = context ? `\n\nThe author's context:\n${context}\n` : ''

  const prompt = `You are a copy editor, not a rewriter. Fix spelling, grammar, and clarity in the following text. Preserve the author's voice and intent. Preserve the original formatting including line breaks, lists, and structure. Do not add or remove ideas. Do not wrap in quotes or code fences. Return only the improved text.${contextSection}\n\nText to improve:\n${text}`

  try {
    const result = await generateText({ model, prompt })
    res.json({ improved: result.text })
  } catch {
    res.status(500).json({ error: 'AI request failed' })
  }
})

const PORT = 3001;

(async () => {
  await ensureGit()
  app.listen(PORT, () => {
    console.log(`February server running on http://localhost:${PORT}`)
  })
})()
