# Architecture

## Data Flow

### Trading Decision Flow

1. **User Request** → API receives trading query
2. **TradingAgent** → Claude processes with tool use
3. **Subagent Delegation** → Specialized analysis:
   - TechnicalAnalyst: Chart patterns, indicators
   - FundamentalAnalyst: On-chain metrics, valuations
   - NewsAnalyst: Sentiment from news sources
   - RiskManager: Position sizing, risk assessment
4. **OrderExecutor** → Execute via OKX with risk controls
5. **Response** → Return analysis and execution status

### Knowledge RAG Flow

1. **Query** → Knowledge tool receives search request
2. **Embedding** → Local nomic-embed-text-v1.5 (sentence-transformers/ONNX), cached for 300s
3. **Hybrid Search** → Vectorized NumPy similarity (projection-optimized) + MongoDB text search in parallel
4. **Fusion** → Reciprocal Rank Fusion (RRF) merges vector and text results
5. **Time Decay** → Exponential decay weighting (news=24h, lessons=7d, strategies=30d half-life)
6. **Re-Ranking** (optional) → FlashRank cross-encoder re-ranks top candidates
7. **Context Assembly** → Retrieve full documents for top-k, format with relevance scores
8. **Response** → Claude uses context for informed answers

### Knowledge Graph

Entity relationships tracked via `KnowledgeEdge` documents:
- `APPLIES_TO` — Strategy → Asset
- `DETECTED_IN` — Pattern → Asset
- `MENTIONS` — News → Asset
- `LEARNED_FROM` — Lesson → Trade
- `USED_IN`, `SUPPORTS`, `CONTRADICTS`, `CORRELATED_WITH`

Edges built incrementally during document creation. Enables multi-hop queries like
"strategies that work for BTC in bearish markets with profitable lesson history."
