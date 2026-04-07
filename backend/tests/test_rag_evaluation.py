"""Tests for RAG evaluation metrics."""

from app.knowledge.evaluator import (
    evaluate_batch,
    evaluate_retrieval,
    mrr,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
)


class TestPrecisionAtK:
    def test_all_relevant(self):
        assert precision_at_k({"a", "b", "c"}, ["a", "b", "c", "d", "e"], k=3) == 1.0

    def test_none_relevant(self):
        assert precision_at_k({"a"}, ["x", "y", "z"], k=3) == 0.0

    def test_partial(self):
        assert precision_at_k({"a", "b"}, ["a", "x", "b", "y", "z"], k=5) == 0.4

    def test_empty_retrieved(self):
        assert precision_at_k({"a"}, [], k=5) == 0.0


class TestRecallAtK:
    def test_all_found(self):
        assert recall_at_k({"a", "b"}, ["a", "b", "c"], k=3) == 1.0

    def test_partial_found(self):
        assert recall_at_k({"a", "b", "c"}, ["a", "x"], k=2) == 1 / 3

    def test_none_found(self):
        assert recall_at_k({"a"}, ["x", "y"], k=2) == 0.0

    def test_empty_relevant(self):
        assert recall_at_k(set(), ["x", "y"], k=2) == 0.0


class TestMRR:
    def test_first_position(self):
        assert mrr({"a"}, ["a", "b", "c"]) == 1.0

    def test_second_position(self):
        assert mrr({"b"}, ["a", "b", "c"]) == 0.5

    def test_not_found(self):
        assert mrr({"x"}, ["a", "b", "c"]) == 0.0


class TestNDCG:
    def test_perfect_ranking(self):
        assert ndcg_at_k({"a", "b"}, ["a", "b", "c"], k=3) == 1.0

    def test_imperfect_ranking(self):
        result = ndcg_at_k({"b"}, ["a", "b", "c"], k=3)
        assert 0 < result < 1

    def test_no_relevant(self):
        assert ndcg_at_k(set(), ["a", "b"], k=2) == 0.0


class TestEvaluateRetrieval:
    def test_returns_all_metrics(self):
        result = evaluate_retrieval({"a", "b"}, ["a", "c", "b", "d", "e"], k=5)
        assert set(result.keys()) == {"precision_at_k", "recall_at_k", "mrr", "ndcg_at_k"}
        assert all(0.0 <= v <= 1.0 for v in result.values())


class TestEvaluateBatch:
    def test_averages_correctly(self):
        queries = [
            {"relevant_ids": {"a"}, "retrieved_ids": ["a", "b"]},
            {"relevant_ids": {"c"}, "retrieved_ids": ["x", "c"]},
        ]
        result = evaluate_batch(queries, k=2)
        # First query: MRR=1.0, Second: MRR=0.5 -> avg=0.75
        assert result["mrr"] == 0.75

    def test_empty_batch(self):
        result = evaluate_batch([], k=5)
        assert result["precision_at_k"] == 0.0
