"""Document chunking for long texts in the RAG pipeline.

Uses fixed-size word chunks with overlap for simplicity and reliability.
Research shows fixed 200-word chunks are competitive with more complex
semantic chunking strategies (NAACL 2025 Findings).
"""

from dataclasses import dataclass


@dataclass
class TextChunk:
    """A chunk of text with metadata for parent-document association."""

    text: str
    chunk_index: int
    total_chunks: int
    start_word: int
    end_word: int


def chunk_text(
    text: str,
    chunk_size: int = 200,
    overlap: int = 50,
    min_chunk_size: int = 30,
) -> list[TextChunk]:
    """Split text into fixed-size word chunks with overlap.

    Args:
        text: The text to chunk.
        chunk_size: Target number of words per chunk.
        overlap: Number of overlapping words between adjacent chunks.
        min_chunk_size: Minimum words for a chunk to be kept (avoids tiny trailing chunks).

    Returns:
        List of TextChunk objects. Returns a single chunk if text is short enough.
    """
    if not text or not text.strip():
        return []

    words = text.split()
    if len(words) <= chunk_size:
        return [
            TextChunk(
                text=text.strip(), chunk_index=0, total_chunks=1, start_word=0, end_word=len(words)
            )
        ]

    chunks: list[TextChunk] = []
    step = max(1, chunk_size - overlap)
    start = 0

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_words = words[start:end]

        # Skip tiny trailing chunks
        if len(chunk_words) < min_chunk_size and chunks:
            # Append remaining words to the last chunk
            last = chunks[-1]
            extra = words[last.end_word : end]
            chunks[-1] = TextChunk(
                text=last.text + " " + " ".join(extra),
                chunk_index=last.chunk_index,
                total_chunks=last.total_chunks,
                start_word=last.start_word,
                end_word=end,
            )
            break

        chunks.append(
            TextChunk(
                text=" ".join(chunk_words),
                chunk_index=len(chunks),
                total_chunks=0,  # Updated below
                start_word=start,
                end_word=end,
            )
        )

        start += step

    # Update total_chunks
    total = len(chunks)
    for i, chunk in enumerate(chunks):
        chunks[i] = TextChunk(
            text=chunk.text,
            chunk_index=chunk.chunk_index,
            total_chunks=total,
            start_word=chunk.start_word,
            end_word=chunk.end_word,
        )

    return chunks


def should_chunk(text: str, threshold_words: int = 300) -> bool:
    """Check if a text is long enough to benefit from chunking."""
    if not text:
        return False
    return len(text.split()) > threshold_words
