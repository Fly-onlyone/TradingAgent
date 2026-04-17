#!/usr/bin/env python
"""PostToolUse hook: auto-format/lint edited files.

- Python files → ruff check --fix + ruff format (via uv run)
- Frontend files → biome check --write (via bun run biome)

Reads Claude Code hook JSON from stdin. Silently skips unknown extensions
and files outside the project. Writes brief status to stderr so Claude
sees the result.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

PY_EXTS = {".py", ".pyi"}
BIOME_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc"}

# Files biome should NOT touch (generated / externally owned)
BIOME_SKIP = {
    "frontend/src/routeTree.gen.ts",
}


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    tool_input = payload.get("tool_input") or {}
    file_path = tool_input.get("file_path")
    if not file_path:
        return 0

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR")
    if not project_dir:
        return 0

    project_root = Path(project_dir).resolve()
    target = Path(file_path).resolve()

    try:
        rel = target.relative_to(project_root).as_posix()
    except ValueError:
        return 0  # outside project

    if not target.is_file():
        return 0

    ext = target.suffix.lower()

    if ext in PY_EXTS:
        subprocess.run(
            ["uv", "run", "ruff", "check", "--fix", str(target)],
            cwd=project_root,
            capture_output=True,
        )
        subprocess.run(
            ["uv", "run", "ruff", "format", str(target)],
            cwd=project_root,
            capture_output=True,
        )
        print(f"[format-after-edit] ruff: {rel}", file=sys.stderr)
        return 0

    if ext in BIOME_EXTS and rel.startswith("frontend/") and rel not in BIOME_SKIP:
        # biome runs from frontend/ with a relative path
        frontend_dir = project_root / "frontend"
        rel_to_frontend = target.relative_to(frontend_dir).as_posix()
        subprocess.run(
            ["bun", "run", "biome", "check", "--write", rel_to_frontend],
            cwd=frontend_dir,
            capture_output=True,
        )
        print(f"[format-after-edit] biome: {rel}", file=sys.stderr)
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
