"""Tests for the embedding model singleton and preload path."""

from __future__ import annotations

import asyncio
import threading
import time

import numpy as np
import pytest
from app.knowledge import embeddings


class FakeSentenceTransformer:
    """Slow constructor used to expose concurrent singleton initialization."""

    calls = 0
    active_inits = 0
    concurrent_init_detected = threading.Event()
    first_init_started = threading.Event()
    allow_finish = threading.Event()

    def __init__(self, model_name: str, *, trust_remote_code: bool) -> None:
        assert model_name == embeddings.MODEL_NAME
        assert trust_remote_code is True

        type(self).calls += 1
        type(self).active_inits += 1

        if type(self).active_inits == 1:
            type(self).first_init_started.set()
            type(self).allow_finish.wait(timeout=1)
        else:
            type(self).concurrent_init_detected.set()
            type(self).allow_finish.set()

    @staticmethod
    def encode(
        texts: list[str],
        *,
        normalize_embeddings: bool,
        show_progress_bar: bool,
    ) -> np.ndarray:
        assert normalize_embeddings is True
        assert show_progress_bar is False
        return np.array([[float(len(text))] * embeddings.DIMENSION for text in texts])


@pytest.mark.asyncio
async def test_preload_and_first_request_share_single_model_init(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(embeddings, "SentenceTransformer", FakeSentenceTransformer)
    monkeypatch.setattr(embeddings, "_model", None)
    monkeypatch.setattr(embeddings, "_model_name", None)
    monkeypatch.setattr(embeddings, "_get_active_model_name", lambda: embeddings.MODEL_NAME)

    FakeSentenceTransformer.calls = 0
    FakeSentenceTransformer.active_inits = 0
    FakeSentenceTransformer.concurrent_init_detected.clear()
    FakeSentenceTransformer.first_init_started.clear()
    FakeSentenceTransformer.allow_finish.clear()

    service = embeddings.EmbeddingService()

    preload_task = asyncio.create_task(embeddings.preload_model())
    query_task = asyncio.create_task(service.generate_query_embedding("hello"))

    assert await asyncio.to_thread(FakeSentenceTransformer.first_init_started.wait, 1)

    await asyncio.sleep(0.05)
    FakeSentenceTransformer.allow_finish.set()

    query_embedding = await query_task
    await preload_task

    assert query_embedding is not None
    assert len(query_embedding) == embeddings.DIMENSION
    assert FakeSentenceTransformer.calls == 1
    assert not FakeSentenceTransformer.concurrent_init_detected.is_set()


class RaceySentenceTransformer:
    """Fake model that fails when two encode calls overlap on shared mutable state."""

    first_encode_started = threading.Event()
    shared_seq_len: int | None = None

    def __init__(self, model_name: str, *, trust_remote_code: bool) -> None:
        assert model_name == embeddings.MODEL_NAME
        assert trust_remote_code is True

    @staticmethod
    def encode(
        texts: list[str],
        *,
        normalize_embeddings: bool,
        show_progress_bar: bool,
    ) -> np.ndarray:
        assert normalize_embeddings is True
        assert show_progress_bar is False

        seq_len = len(texts[0])
        cls = RaceySentenceTransformer

        if not cls.first_encode_started.is_set():
            cls.shared_seq_len = seq_len
            cls.first_encode_started.set()
            time.sleep(0.1)
            if cls.shared_seq_len != seq_len:
                raise RuntimeError("simulated rotary cache corruption")
        else:
            cls.shared_seq_len = seq_len
            time.sleep(0.01)

        return np.array([[float(seq_len)] * embeddings.DIMENSION for _ in texts])


@pytest.mark.asyncio
async def test_concurrent_encode_calls_are_serialized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(embeddings, "SentenceTransformer", RaceySentenceTransformer)
    monkeypatch.setattr(embeddings, "_model", None)
    monkeypatch.setattr(embeddings, "_model_name", None)
    monkeypatch.setattr(embeddings, "_get_active_model_name", lambda: embeddings.MODEL_NAME)

    RaceySentenceTransformer.first_encode_started.clear()
    RaceySentenceTransformer.shared_seq_len = None

    service = embeddings.EmbeddingService()

    first_task = asyncio.create_task(service.generate_query_embedding("alpha"))
    assert await asyncio.to_thread(RaceySentenceTransformer.first_encode_started.wait, 1)

    second_task = asyncio.create_task(
        service.generate_query_embedding("beta beta beta beta beta beta beta beta")
    )

    first_embedding, second_embedding = await asyncio.gather(first_task, second_task)

    assert first_embedding is not None
    assert second_embedding is not None
