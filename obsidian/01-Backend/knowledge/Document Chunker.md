---
tags: [backend, knowledge]
---

# Document Chunker

> Fixed-size word chunking with overlap — 200 words per chunk, 50-word overlap.

## Source

- `backend/app/knowledge/chunker.py` (`chunk_text`, `should_chunk`, `TextChunk`)

## How it works

`chunk_text(text, chunk_size=200, overlap=50, min_chunk_size=30)` splits on
whitespace, then slides a window with `step = chunk_size - overlap = 150 words`.
Texts at or below the chunk size return as a single chunk. Trailing chunks below
`min_chunk_size` are merged back into the previous chunk so we never store
30-word stragglers. Each `TextChunk` carries `chunk_index`, `total_chunks`,
and `start_word`/`end_word` offsets — these get persisted on
[[KnowledgeChunk Model]] documents pointing back at the parent.

`should_chunk(text, threshold_words=300)` is a cheap gate callers use to skip
the splitter for short docs entirely. Research note in the module: fixed 200-word
chunks are competitive with fancier semantic chunking strategies
(NAACL 2025 Findings) for trading-domain text.

## Used by

- News crawler (long articles)
- Strategy / lesson ingestion (only when length > threshold)

## See also

- [[_index]]
- [[KnowledgeChunk Model]]
- [[RAG Retrieval Pipeline]]
