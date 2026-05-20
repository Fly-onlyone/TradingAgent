"""Typed surfaces for ATK responses + errors.

Downstream callers (`openai_bridge`, `/api/v1/atk/proxy`, future retry logic)
need structured errors so they can apply a retry policy. Without this typed
form the bridge would just return stringified content and nobody could write
a sane retry layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

ErrorCategory = Literal[
    "rate_limit",
    "invalid_arg",
    "okx_rejection",
    "auth",
    "transport",
    "unknown",
]


@dataclass(frozen=True)
class AtkError:
    """Translated form of ATK's structured error envelope."""

    category: ErrorCategory
    retryable: bool
    code: str | None  # OKX numeric code if available (e.g. "50011")
    message: str
    raw: dict[str, Any]  # original envelope, kept for full forensics

    @classmethod
    def from_atk_envelope(cls, env: dict[str, Any]) -> AtkError:
        """Translate ATK's structured error block.

        ATK error shape per ARCHITECTURE.md §7:
            { error: true, type, code, message, endpoint, traceId,
              timestamp, serverVersion }
        """
        code = str(env.get("code") or "") or None
        msg = str(env.get("message") or "")
        err_type = env.get("type") or ""
        cat: ErrorCategory = "unknown"
        retryable = False

        if err_type == "RateLimitError":
            cat, retryable = "rate_limit", True
        elif err_type == "AuthenticationError":
            cat, retryable = "auth", False
        elif err_type == "NetworkError":
            cat, retryable = "transport", True
        elif err_type == "ValidationError":
            cat, retryable = "invalid_arg", False
        elif err_type == "OkxApiError":
            cat = "okx_rejection"
            # Known transient OKX codes (system busy / system error / try again).
            retryable = code in {"50011", "50013", "50061"}

        return cls(
            category=cat,
            retryable=retryable,
            code=code,
            message=msg,
            raw=env,
        )
