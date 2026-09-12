# Models: by capability, not by nationality

> "There are new Chinese open-source models that are very clever." Yes — and the catalogue already
> showed it: seven of fourteen LLMs are Qwen, and bge-m3 comes from BAAI. But "clever" is not the
> criterion. This document says what is, what was added on 11 September 2026 after checking the
> official sources, and what changes in the pipeline. Français : [MODELES.md](../fr/MODELES.md)

## The criterion

A model enters the catalogue if it fills a **missing capability**, runs **on the target machine** (a
CPU with 16 or 32 GB of RAM, no GPU, often a Raspberry Pi), speaks **French** at the required level,
and has a **licence** that lets it be copied hand to hand. The lab's nationality is not in the
equation — except for one thing: Chinese labs currently publish the best open weights in several of
these capabilities, and not saying so would be dishonest.

Verified today, directly on `ollama.com`: **Qwen3.5** (Feb–Mar 2026, natively multimodal at every
size, 201 languages, Apache-2.0), **Qwen3.6** (April 2026, agentic coding and reasoning
preservation), **Qwen3-Embedding** (0.6B/4B/8B, adjustable dimensions), **DeepSeek-OCR** (3B, a scan
becomes Markdown). The big models of the moment — DeepSeek V4, GLM-5.2, Kimi K3 — have hundreds of
billions of parameters and **do not run** on our machines; they do not enter, and that is not an
opinion about their quality.

## What changes, capability by capability

**Chat and reasoning.** Qwen3.5 replaces Qwen3 at the 8 and 16 GB tiers: same footprint, but it
*sees* — a photo of a fault, an existing schematic, a label. Arche's default becomes `qwen3.5:9b`.
Unchanged rule, repeated in the entry: it reads an image, it **never** validates that a species is
edible.

**The sweet spot for a machine with no GPU: MoE.** `qwen3.5:35b-a3b` has 35 billion parameters on
disk and **3 billion active** per token. On a CPU with 32 GB of RAM it answers at small-model speed
with large-model quality. It is the architectural discovery of 2026 for offline use, and it is now
the first choice at the 32 GB tier. `qwen3.6:27b`, dense, remains preferable with a GPU and for
writing diagram sources (ADR 0009).

**Reranking — the cheapest quality lever in RAG.** Hybrid retrieval (BM25 + dense) brings things
close; it does not *read*. A reranker takes the (question, passage) pair and returns a relevance —
it actually reads. **Qwen3-Reranker 0.6B** does that on CPU in a few hundred milliseconds for thirty
passages. It is served by `llama-server --reranking` (`/v1/rerank` endpoint) because Ollama has no
reranking API; `src/core/rag/rerank.ts` calls it, falls back to a yes/no through Ollama if
llama-server is absent, and keeps the fusion order if nothing answers. The reranker is a bonus; its
absence is never a failure. Tested against a fake server.

**Embeddings — candidate, not replacement.** Qwen3-Embedding 0.6B is smaller than bge-m3 and covers
more languages. But ADR 0007 stands: *an index is bound to its model*. The reference changes only
after being **measured** on `knowledge/eval.yaml`, and by republishing every shard. Both sizes are
registered in `embed.ts` with their dimensions; bge-m3 remains the reference until the measurement
has spoken.

**OCR — the missing organ of ingestion.** A huge share of the useful corpus is *scanned*: the
Survivor Library (19th-century manuals), BHL plates, Hesperian PDFs, a handwritten seed log. Without
OCR none of it enters the index. **DeepSeek-OCR** (Ollama, MIT) outputs a page as Markdown with its
tables; **PaddleOCR-VL** (0.9B, Apache-2.0, pip) handles skewed scans and warped pages — exactly the
state of old manuals. The two complement each other.

**Speech — and the criterion that decides.** Someone who reads poorly, has busy hands or low vision
must be able to *ask* the question and *hear* the answer. Chinese speech models (SenseVoice,
CosyVoice) are excellent — and **do not cover French**. So **whisper.cpp** (99 languages, very good
French, native binary, runs on a Pi 5) and **Piper** (free French voices, fast on a Pi). It is the
textbook case of the criterion: not the cleverest enters, but the one that speaks the user's
language.

**What does not enter, and why.** DeepSeek-R1 distills (May 2025): superseded by Qwen3.5/3.6 in
thinking mode, with nothing extra. Qwen3.8 27B: announced for August 2026 by a single source, not
yet verified on Ollama — to reassess at the tracker's next pass. GLM-4.x and Kimi at small sizes:
nothing verified that beats Qwen3.5 at equal size as I write.

## The tiers, revised

| RAM | What is proposed |
|---|---|
| 4 GB | Qwen3 1.7B, nomic-embed |
| 8 GB | **Qwen3.5 4B** (multimodal), Gemma 3 4B, nomic-embed |
| 16 GB | **Qwen3.5 9B** (default), Qwen2.5-Coder 7B, bge-m3, **Qwen3-Reranker**, **DeepSeek-OCR** |
| 32 GB | **Qwen3.5 35B-A3B** (MoE, CPU), **Qwen3.6 27B**, Qwen3 14B, bge-m3, reranker, OCR |
| 64 GB | Qwen3.6 27B, Qwen3.5 35B-A3B, Qwen3 32B, Gemma 3 27B, Qwen2.5-Coder 32B, bge-m3, reranker, OCR |

Since ADR 0012 a tier is *what runs comfortably*, not a cap: a model above it can still be
installed and runs from disk, slowly — `arche compute estimate` says how slowly before launching.

The `ai` bundle becomes: Ollama, llama.cpp (for reranking), whisper.cpp, Piper, embeddings — and
Arche's own UI. Open WebUI is no longer in it, per ADR 0008.

## What it does not settle

A 9-billion-parameter model will get component values, dosages and dimensions wrong — which is why
numbers go through calculators, diagrams through generators, and the three sensitive subjects
through a human (ADR 0007, 0009). A cleverer model lowers the error rate; it does not change the
architecture that makes errors harmless. And "verified today" is worth today: the `ollama` tracker,
twice a week, will say whether these tags still exist and what they weigh.

**Sources consulted** — [ollama.com/library/qwen3.5](https://ollama.com/library/qwen3.5) ·
[ollama.com/library/qwen3.6](https://ollama.com/library/qwen3.6) ·
[ollama.com/library/qwen3-embedding](https://ollama.com/library/qwen3-embedding) ·
[ollama.com/library/deepseek-ocr](https://ollama.com/library/deepseek-ocr) ·
[ollama.com/library/deepseek-r1](https://ollama.com/library/deepseek-r1) ·
[Qwen models guide (InsiderLLM)](https://insiderllm.com/guides/qwen-models-guide/) ·
[Best open-source LLMs, Sept. 2026 (Thunder Compute)](https://www.thundercompute.com/blog/best-open-source-llms) ·
[OCR benchmark 2026 (Regolo)](https://regolo.ai/deepseek-ocr-vs-glm-ocr-vs-paddleocr-benchmark-2026/) ·
[Qwen3 reranker via Ollama (Apidog)](https://apidog.com/blog/qwen-3-embedding-reranker-ollama/).
