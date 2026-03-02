# February

Your context shouldn't be locked inside a tool. It should be yours — versioned, portable, readable by any AI.

February is a local-first interface for externalising your context. Markdown files underneath, Git versioning silent, any AI can read them. Clone it, run one command, start writing. The model is interchangeable. The context stays yours.

---

## Run it

```
git clone https://github.com/tonhaoln/february-os.git
cd february-os
npm install
npm start
```

Browser opens. Your workspace is ready.

You'll need an API key from [Anthropic](https://console.anthropic.com) or [OpenAI](https://platform.openai.com) — enter it on first use in the AI panel.

---

## What it does

- Write in a clean editor — no markdown syntax visible
- Every save commits to Git automatically
- Ask AI questions scoped to your open page and your context
- `CONTEXT.md` is always in every query — your session anchor

---

**Status:** Early. Working. Building in public.

Follow the build: [linkedin.com/in/antonioal](https://www.linkedin.com/in/antonioal/)

**Licence:** MIT
