---
tags: [glossary]
---

# RAG

Retrieval-Augmented Generation: feeding an LLM with retrieved documents so its answers are grounded in real source material instead of training memory. In this codebase, RAG powers the knowledge tool — see [[RAG Retrieval Pipeline]] for the full hybrid (vector + text) flow, [[Reciprocal Rank Fusion]] for merging, [[Time Decay Weighting]] for freshness, and the optional [[FlashRank Reranker]] for precision.

## See also

- [[_index]]
- [[RAG Retrieval Pipeline]]
- [[Hybrid Retriever]]
