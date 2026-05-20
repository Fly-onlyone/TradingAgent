---
tags: [backend, knowledge]
---

# Local Embeddings

> Local 768-dim text embeddings via sentence-transformers (ONNX/PyTorch backend),
> with model selection driven by `AppSettings.embedding_model_name`.

## Source

- `backend/app/knowledge/embeddings.py`

## How it works

`EmbeddingService` is a thread-safe singleton wrapping a lazily-loaded
`SentenceTransformer` (default: **nomic-embed-text-v1.5**, 137M params, 768 dim).
`preload_model()` warms the model in a `ThreadPoolExecutor` during app startup so
the first request doesn't pay the cold-start cost. Encode runs on a 2-worker pool
with an `_encode_lock` because remote-code models share rotary caches across
threads. Document text gets the model's `prefix_document` ("search_document: "
for Nomic); queries get `prefix_query` and pass through [[Embedding Cache]].
Specialised generators (`StrategyEmbeddingGenerator`, `NewsEmbeddingGenerator`, …)
serialise model dicts into structured text and prepend the [[Context Generator]]
prefix when present. If `sentence-transformers` can't import (PyInstaller bundles),
the service permanently disables itself and returns `None`.

## Depends on

- [[Embedding Models Registry]]
- [[Game Detector]]
- [[App Settings]]

## Used by

- [[Hybrid Retriever]]
- [[Vector Search]]
- News crawler, strategy ingestion, lesson writer

## Gotchas

- Switching models requires `reload_model()`; all 3 supported models share 768 dim so vectors stay compatible.
- `OMP_NUM_THREADS=1` is set at import time to avoid thread over-subscription.

## See also

- [[_index]]
- [[RAG Retrieval Pipeline]]
