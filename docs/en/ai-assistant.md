# Local AI as an accessibility interface

> Français : [assistant-ia.md](../fr/assistant-ia.md)

## The role we give it

For a non-maker the library is intimidating: 40 ZIMs, hundreds of thousands of articles, technical
vocabulary. The local AI is not there to *replace* the library but to **act as the librarian**:
understand a question asked in everyday words, say *where* to look, summarise, translate, rephrase
for a child, and — above all — **cite the page** so the user can check.

Three uses, from safest to riskiest:

1. **Orient**: "I have a question about canning" → "open *Food preparation and preservation*,
   sterilisation section; or Wikibooks › Canning". No hallucination possible: the AI points to
   documents that exist.
2. **Explain** a found article: simplify, translate, convert units, adapt to a context ("I have no
   jars, only bottles").
3. **Answer directly** — useful for DIY, dangerous for health. We fence it.

## Chosen architecture: RAG over the ZIMs through kiwix-serve

No need to extract or convert the ZIMs. `kiwix-serve` already exposes a **full-text search API**
(`/search?content=<zim>&pattern=<words>`) and each article's HTML. The pipeline:

```
question → (1) LLM rewrites it as keywords
         → (2) kiwix-serve /search over the relevant ZIMs (chosen by category)
         → (3) top-k articles, text extracted (HTML → text, 2–3,000 chars each)
         → (4) prompt: "answer only from the excerpts, cite [source]" → LLM
         → answer + clickable links to the Kiwix pages
```

It runs on a Pi 5 with a 4B model: search is done by Kiwix (Xapian, instant), the LLM only reads
and writes. Embeddings (`nomic-embed-text`, `bge-m3`) are an **optional upgrade**: index the priority
ZIMs (medicine, water, food) once for semantic search ("my child has had diarrhoea for 3 days" →
oral rehydration) that keyword search misses.

Update (ADR 0011): Arche does not write this client — it serves its library and tools over MCP to the
client you already have, see [AI-CLIENTS.md](AI-CLIENTS.md). Earlier plan, kept for history: `arche assist` (command) and a tab in the web UI, relying on Open WebUI when
installed (it does document RAG and accepts "tools") or on a small built-in server otherwise.
**Not implemented in this version** — see DECISIONS.md.

## What goes in the system prompt

- The user's language; "explain as to someone who has never done this".
- "You have no internet access. Your sources are the documents provided. If the answer is not
  there, say so and suggest where to look in the library."
- "For anything touching health, medication, doses, household electricity, weapons, chemicals: cite
  the exact source and remind the user to check the document."
- The list of installed ZIMs with one sentence each (generated from `state.json` + catalog).

## Guardrails

- **Mandatory citation**: an answer without a source is shown with an "unverified" banner.
- **Sensitive domains** (health, safety): the prompt requires the citation *and* the UI shows the
  source excerpt next to the answer, not only a link.
- **Model suited to the machine**: a 1.7B hallucinates a lot; below the `small` tier the UI only
  enables use 1 (orient).
- **No long-term memory** by default: every conversation starts fresh to avoid error build-up.

## For the beginner profile, concretely

Arche UI home page: an "Ask your question" field above the library list. Three clickable examples
("How do I make water safe to drink?", "A wound is getting infected, what do I do?", "Fix a bike
that skips gears"). The answer comes with 2–3 "Read the full page" cards opening Kiwix. No model,
temperature or context settings.

## For the expert profile

Full Open WebUI, swappable models, RAG on your own PDFs, and Aider/OpenCode for code. The DevDocs
and StackExchange ZIMs can be plugged in as a search "tool" for the coding agent (kiwix search →
excerpt → context), giving a Claude Code-like with documentation as fresh as the last download.
