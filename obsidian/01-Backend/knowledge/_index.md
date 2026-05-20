---
tags: [backend, knowledge, moc]
---

# Knowledge Module — MOC

> Map of the `backend/app/knowledge/` package: local embeddings, hybrid retrieval,
> fusion, re-ranking, chunking, knowledge-graph edges, and RAG evaluation.

## Source

- `backend/app/knowledge/` (11 modules)

## How it works

This module owns the RAG pipeline described in [[RAG Retrieval Pipeline]].
Embedding generation runs locally on CPU via sentence-transformers. The
retriever orchestrates parallel vector + text search, fuses rankings via
RRF, applies per-collection time decay, and optionally re-ranks with a
cross-encoder. A knowledge-graph builder writes typed edges into the
[[KnowledgeEdge Model]] each time a document is created. All search
methods return `list[tuple[Document, float]]` — every consumer unpacks.

## Notes in this folder

- [[Local Embeddings]]
- [[Embedding Cache]]
- [[Embedding Models Registry]]
- [[Hybrid Retriever]]
- [[Vector Search]]
- [[Text Search]]
- [[Reciprocal Rank Fusion]]
- [[Time Decay Weighting]]
- [[FlashRank Reranker]]
- [[Context Generator]]
- [[Document Chunker]]
- [[Knowledge Graph Builder]]
- [[Game Detector]]
- [[RAG Evaluator]]

## See also

- [[RAG Retrieval Pipeline]]
- [[Knowledge Tools]]
- [[StrategyKnowledge Model]] · [[TradeLesson Model]] · [[TradingPattern Model]] · [[NewsArticle Model]]
