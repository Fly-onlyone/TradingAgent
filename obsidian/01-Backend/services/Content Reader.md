---
tags: [backend, services, ingest]
---

# Content Reader

> URL fetching + multi-format file parsing for the strategy-import flow.

## Source

- `backend/app/services/content_reader.py`

## How it works

Two entry points:

- `fetch_url_content(url)` — 30s `httpx` GET → `trafilatura.extract(include_tables=True)`. Raises `ValueError` on empty extraction.
- `read_uploaded_file(file)` — accepts FastAPI `UploadFile`, enforces `MAX_FILE_SIZE=10MB` and `ALLOWED_EXTENSIONS={.txt, .json, .yaml, .yml, .pdf}`. PDFs are read via `fitz` (PyMuPDF) page-by-page; JSON and YAML are round-tripped to indented text so the AI extractor sees a stable structure.

## Depends on

- `httpx`, `trafilatura`, `PyMuPDF` (`fitz`), `pyyaml`

## Used by

- [[Strategy Import Endpoints]]

## See also

- [[_index]]
