"""Registry of supported local embedding models.

All models produce 768-dim vectors and are sentence-transformers compatible,
so switching between them does NOT require re-embedding existing data.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class EmbeddingModelConfig:
    """Configuration for a local embedding model."""

    hf_id: str
    label: str
    dimension: int
    prefix_document: str
    prefix_query: str
    description: str
    params_millions: int


EMBEDDING_MODELS: dict[str, EmbeddingModelConfig] = {
    "nomic-ai/nomic-embed-text-v1.5": EmbeddingModelConfig(
        hf_id="nomic-ai/nomic-embed-text-v1.5",
        label="Nomic Embed v1.5",
        dimension=768,
        prefix_document="search_document: ",
        prefix_query="search_query: ",
        description="Balanced — best quality-to-speed ratio on CPU (137M params, ~42ms/1K tok)",
        params_millions=137,
    ),
    "BAAI/bge-base-en-v1.5": EmbeddingModelConfig(
        hf_id="BAAI/bge-base-en-v1.5",
        label="BGE Base v1.5",
        dimension=768,
        prefix_document="",
        prefix_query="Represent this sentence for searching relevant passages: ",
        description="Fast — lighter and half the latency (110M params, ~23ms/1K tok)",
        params_millions=110,
    ),
    "google/embeddinggemma-300m": EmbeddingModelConfig(
        hf_id="google/embeddinggemma-300m",
        label="EmbeddingGemma 300M",
        dimension=768,
        prefix_document="",
        prefix_query="",
        description="Quality — best MTEB score under 500M params (308M params, ~70ms/1K tok)",
        params_millions=308,
    ),
}

DEFAULT_MODEL = "nomic-ai/nomic-embed-text-v1.5"
SUPPORTED_MODEL_NAMES = list(EMBEDDING_MODELS.keys())


def get_model_config(model_name: str) -> EmbeddingModelConfig:
    """Get config for a model name, falling back to default if unknown."""
    config = EMBEDDING_MODELS.get(model_name)
    if config is None:
        raise ValueError(
            f"Unknown embedding model: {model_name}. "
            f"Supported: {', '.join(SUPPORTED_MODEL_NAMES)}"
        )
    return config
