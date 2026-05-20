---
tags: [backend, knowledge]
---

# Embedding Models Registry

> Static registry of supported local embedding models — all 768 dim so they're
> hot-swappable without re-embedding.

## Source

- `backend/app/knowledge/embedding_models.py`

## How it works

`EMBEDDING_MODELS` maps HuggingFace ids to `EmbeddingModelConfig` dataclasses
holding the model's prefix tokens, dimension, parameter count, and human label.
Three models are registered:

- **`nomic-ai/nomic-embed-text-v1.5`** (default, 137M, balanced) — uses
  `search_document: ` / `search_query: ` prefixes.
- **`BAAI/bge-base-en-v1.5`** (110M, fast) — query-only prefix.
- **`google/embeddinggemma-300m`** (308M, highest MTEB) — no prefixes.

`get_model_config()` looks up by name and raises `ValueError` for unknown ids.
`AppSettings.embedding_model_name` selects the active entry at runtime;
[[Local Embeddings]] reads this and reloads as needed.

## Used by

- [[Local Embeddings]]
- Settings UI (model picker)

## Gotchas

- Adding a new model is one dict entry — but it must produce 768-dim vectors or the existing data becomes incompatible.

## See also

- [[_index]]
- [[Local Embeddings]]
