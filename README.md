# FAQ Generator AI

A browser app that converts support questions, policy text, or product notes into structured FAQ entries.

## Features

- Question rewrite
- Short answer
- Full answer
- Escalation guidance
- Related FAQs
- Schema-ready output
- Hallucination checklist
- API key input and model selector
- Deterministic mode + strictness slider
- Prompt template/version controls
- JSON schema validation for model output
- Copy and export (Markdown/HTML/DOCX)
- Example dataset loader
- Human review checklist and warning banner

## Architecture

- **Front end:** HTML/CSS/JS form app with browser-side preview and export actions.
- **Back end:** Node.js + Express relay that keeps OpenAI calls server-side.
- **Prompt templates:** Stored in `data/prompt-templates.json`.
- **Output schema validation:** JSON Schema + Ajv in `server.js`.
- **LLM integration:** Reusable Responses API wrapper with model selector, deterministic mode, strictness-to-temperature mapping, and schema-formatted output.

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start server:

   ```bash
   npm start
   ```

3. Open:

   ```
   http://localhost:3000
   ```

You can either set `OPENAI_API_KEY` in your environment, or paste an API key in the UI field.
