"""Content reading utilities for strategy import (URL fetch and file parsing)."""

import json
import logging
from pathlib import PurePosixPath

import httpx
import trafilatura
import yaml
from fastapi import UploadFile

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {".txt", ".json", ".yaml", ".yml", ".pdf"}


async def fetch_url_content(url: str) -> str:
    """Fetch and extract text content from a URL using trafilatura."""
    async with httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; TradingAgent/1.0)"},
    ) as client:
        response = await client.get(url)
        response.raise_for_status()

    from trafilatura.settings import use_config

    config = use_config()
    extracted = trafilatura.extract(
        response.text,
        include_comments=False,
        include_tables=True,
        config=config,
    )
    if not extracted:
        raise ValueError(f"Could not extract text content from {url}")
    return extracted


async def read_uploaded_file(file: UploadFile) -> str:
    """Read and extract text content from an uploaded file."""
    filename = file.filename or "unknown"
    ext = PurePosixPath(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    content_bytes = await file.read()
    if len(content_bytes) > MAX_FILE_SIZE:
        raise ValueError(
            f"File too large ({len(content_bytes)} bytes). Maximum: {MAX_FILE_SIZE} bytes"
        )

    if ext == ".pdf":
        return _extract_pdf_text(content_bytes)
    elif ext == ".json":
        return _read_json(content_bytes)
    elif ext in (".yaml", ".yml"):
        return _read_yaml(content_bytes)
    else:
        return content_bytes.decode("utf-8")


def _extract_pdf_text(file_bytes: bytes) -> str:
    """Extract text from all pages of a PDF."""
    import fitz

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    try:
        pages = [page.get_text() for page in doc]
    finally:
        doc.close()

    text = "\n".join(pages).strip()
    if not text:
        raise ValueError("PDF contains no extractable text")
    return text


def _read_json(content_bytes: bytes) -> str:
    """Parse JSON and return as readable text."""
    data = json.loads(content_bytes.decode("utf-8"))
    return json.dumps(data, indent=2, ensure_ascii=False)


def _read_yaml(content_bytes: bytes) -> str:
    """Parse YAML and return as readable text."""
    data = yaml.safe_load(content_bytes.decode("utf-8"))
    return yaml.dump(data, default_flow_style=False, allow_unicode=True)
