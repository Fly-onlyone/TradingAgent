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
2. **Embedding** → Local nomic-embed-text-v1.5 (sentence-transformers/ONNX)
3. **Weighted Retrieval** → Python-side cosine similarity over MongoDB documents plus metadata ranking
4. **Context Assembly** → Retrieve and format relevant strategies, lessons, and patterns
5. **Response** → Claude uses context for informed answers

Notes:

- News uses a separate retrieval path and is not injected by the automatic knowledge retriever.
- Trading tasks should build retrieval queries from task context, not from a symbol-only placeholder.


