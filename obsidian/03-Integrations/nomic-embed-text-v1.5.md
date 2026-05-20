---
tags: [integrations]
---

# nomic-embed-text-v1.5

> The specific embedding model loaded by [[sentence-transformers]] via [[ONNX]] runtime.

## Used for

- Embedding all RAG documents and queries
- Powers similarity scoring in the [[Hybrid Retriever]]'s vectorized NumPy dot-product

## Configuration

- Loaded via `sentence-transformers` with `trust_remote_code=True`
- ONNX backend for fast CPU inference
- Output dim: 768

## Gotchas

- Model files are cached in the user's HuggingFace cache directory — first launch downloads ~500MB
- Combined with [[Context Generator]] which prepends 1-2 sentence context prefix before embedding

## See also

- [[_index]]
- [[sentence-transformers]]
- [[ONNX]]
- [[Local Embeddings]]
