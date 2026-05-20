---
tags: [backend, knowledge]
---

# Reciprocal Rank Fusion

> Rank-based fusion that merges vector + text rankings without needing comparable scores.

## Source

- `backend/app/knowledge/fusion.py` (`rrf_merge`)

## How it works

For each document `d` appearing in either ranking, RRF computes
`score(d) = Σ 1 / (k + rank_i + 1)` summed across rankings, with `_RRF_K = 60`
(the classic Cormack et al. constant). Vector results carry their similarity
score but only their *rank* feeds RRF — same for text results, where the
underlying MongoDB textScore is dropped. Both streams are weighted equally
(no per-stream multiplier). The merged dict maps `str(doc.id)` → `(doc, rrf_score)`,
sorts descending, and slices to `limit`.

```
score(d) = 1/(60 + vec_rank + 1) + 1/(60 + text_rank + 1)
```

## Depends on

- [[Vector Search]] · [[Text Search]]

## Used by

- [[Hybrid Retriever]] (all four `search_*` methods)

## Gotchas

- The returned float is an RRF score, not a similarity — typical values are tiny (e.g. 0.03), unlike the raw cosine scores upstream. UI surfaces display it as "relevance".
- `k=60` makes the function fairly forgiving of rank differences — bump it higher to flatten the curve.

## See also

- [[_index]]
- [[RAG Retrieval Pipeline]]
