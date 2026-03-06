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

// --- Improve route ---

app.post('/api/improve', async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'Missing text' })

  const { provider, ollamaModel } = await detectProvider()
  const model = selectModel(provider, ollamaModel)

  const prompt = `Fix spelling, grammar, and clarity in the following text. Preserve the author's voice and intent. Do not add or remove ideas. Do not wrap in quotes or code fences. Return only the improved text.\n\n${text}`

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
