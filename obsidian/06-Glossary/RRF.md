---
tags: [glossary]
---

# RRF

Reciprocal Rank Fusion: a score-free way to merge multiple ranked lists by summing `1 / (k + rank)` across lists. Typical `k=60`. Used in `backend/app/services/rag/fusion.py` to combine vector and text search results inside the [[Hybrid Retriever]]. Survives when scores from different scorers aren't comparable.

## See also

- [[_index]]
- [[Reciprocal Rank Fusion]]
- [[RAG]]
