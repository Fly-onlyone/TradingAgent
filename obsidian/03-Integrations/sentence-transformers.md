---
tags: [integrations]
---

# sentence-transformers

> Local embedding library used to generate vectors for [[RAG Retrieval Pipeline]] without external API calls.

## Used for

- Generating embeddings for knowledge documents (strategies, lessons, news, patterns)
- Query embeddings for retrieval ([[Hybrid Retriever]])
- Cached with 300s TTL ([[Embedding Cache]])

## Configuration

- `sentence-transformers>=5.0.0`
- Model: [[nomic-embed-text-v1.5]] (ONNX backend)
- Requires `einops>=0.8.0` for model loading

## Gotchas

- First load is slow (model download/compile) — embeddings are deferred when games are detected via `psutil`
- Embedding generation runs in a worker thread to avoid blocking the event loop

## See also

- [[_index]]
- [[nomic-embed-text-v1.5]]
- [[Local Embeddings]]
- [[Embedding Cache]]
