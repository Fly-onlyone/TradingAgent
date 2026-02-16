"""Automate bug tracker entries from error-level log records."""

from __future__ import annotations

import hashlib
import re
import sys
from datetime import UTC, datetime
from typing import Any

from pymongo.errors import DuplicateKeyError

from app.db.models.bug import Bug

_ERROR_LEVELS = {"ERROR", "CRITICAL"}
_FINGERPRINT_INPUT_LIMIT = 1024
_TRACEBACK_LIMIT = 16000
_DYNAMIC_ID_PATTERN = re.compile(
    r"\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{24})\b",
    flags=re.IGNORECASE,
)
_NUMBER_PATTERN = re.compile(r"\d+")


class BugAutomationService:
    """Convert log records into deduplicated bug tracker entries."""

    async def ingest_log_records(self, records: list[dict[str, Any]]) -> None:
        """Ingest a batch of log records and upsert auto-created bugs."""
        for record in records:
            if not self._should_capture(record):
                continue

            try:
                await self._ingest_record(record)
            except Exception as exc:  # noqa: BLE001 - must never break logging flow
                # Avoid recursive logging from within logging handlers.
                sys.stderr.write(f"Bug automation ingest failed: {exc}\n")

    @staticmethod
    def _should_capture(record: dict[str, Any]) -> bool:
        level = str(record.get("level") or "").upper()
        return level in _ERROR_LEVELS

    async def _ingest_record(self, record: dict[str, Any]) -> None:
        now = datetime.now(UTC)
        level = str(record.get("level") or "").upper()
        logger_name = str(record.get("logger_name") or "")
        message = str(record.get("message") or "")
        module = self._as_optional_str(record.get("module"))
        function = self._as_optional_str(record.get("function"))
        line = self._as_optional_int(record.get("line"))
        request_id = self._as_optional_str(record.get("request_id"))
        user_id = self._as_optional_str(record.get("user_id"))
        traceback_text = self._normalize_traceback(record.get("traceback"))

        fingerprint = self._fingerprint(record)
        title = self._derive_title(level, logger_name, module, function)
        description = self._derive_description(
            level=level,
            logger_name=logger_name,
            module=module,
            function=function,
            line=line,
            message=message,
            request_id=request_id,
            user_id=user_id,
            traceback_text=traceback_text,
        )
        severity = self._derive_severity(level)
        category = self._derive_category(logger_name, module)

        collection = Bug.get_pymongo_collection()
        update = {
            "$setOnInsert": {
                "created_at": now,
                "status": "open",
                "resolved_at": None,
                "first_seen_at": now,
            },
            "$set": {
                "title": title,
                "description": description,
                "severity": severity,
                "category": category,
                "updated_at": now,
                "source": "log",
                "auto_created": True,
                "fingerprint": fingerprint,
                "last_seen_at": now,
                "last_level": level,
                "last_logger_name": logger_name,
                "last_module": module,
                "last_function": function,
                "last_line": line,
                "last_request_id": request_id,
                "last_user_id": user_id,
                "last_message": message or None,
                "last_traceback": traceback_text,
            },
            "$inc": {"occurrence_count": 1},
        }

        query = {"auto_created": True, "fingerprint": fingerprint}
        try:
            await collection.update_one(query, update, upsert=True)
        except DuplicateKeyError:
            await collection.update_one(query, update, upsert=False)

        await collection.update_one(
            {**query, "status": "resolved"},
            {
                "$set": {
                    "status": "open",
                    "resolved_at": None,
                    "updated_at": now,
                }
            },
            upsert=False,
        )

    def _fingerprint(self, record: dict[str, Any]) -> str:
        logger_name = str(record.get("logger_name") or "")
        message = self._normalize_message(str(record.get("message") or ""))
        traceback_text = self._normalize_traceback(record.get("traceback"))
        exception_type = self._extract_exception_type(traceback_text)
        top_frame = self._extract_top_app_frame(traceback_text)

        raw = "|".join(
            [
                exception_type,
                top_frame,
                logger_name,
                message,
            ]
        )
        clipped = raw[:_FINGERPRINT_INPUT_LIMIT]
        return hashlib.sha256(clipped.encode("utf-8")).hexdigest()

    @staticmethod
    def _derive_title(
        level: str,
        logger_name: str,
        module: str | None,
        function: str | None,
    ) -> str:
        location_parts = [p for p in [module, function] if p]
        location = (
            ".".join(location_parts) if location_parts else logger_name or "system"
        )
        return f"{level} in {location}"[:300]

    @staticmethod
    def _derive_description(
        *,
        level: str,
        logger_name: str,
        module: str | None,
        function: str | None,
        line: int | None,
        message: str,
        request_id: str | None,
        user_id: str | None,
        traceback_text: str | None,
    ) -> str:
        lines: list[str] = [
            f"Level: {level}",
            f"Logger: {logger_name}",
            f"Message: {message or '(empty)'}",
        ]

        if module:
            lines.append(f"Module: {module}")
        if function:
            lines.append(f"Function: {function}")
        if line is not None:
            lines.append(f"Line: {line}")
        if request_id:
            lines.append(f"Request ID: {request_id}")
        if user_id:
            lines.append(f"User ID: {user_id}")
        if traceback_text:
            lines.append("")
            lines.append("Traceback:")
            lines.append(traceback_text)

        return "\n".join(lines)

    @staticmethod
    def _derive_severity(level: str) -> str:
        if level == "CRITICAL":
            return "critical"
        return "high"

    @staticmethod
    def _derive_category(logger_name: str, module: str | None) -> str:
        target = f"{logger_name} {module or ''}".lower()
        if "bug_automation" in target:
            return "automation_test"
        if "api.websocket" in target or "websocket" in target:
            return "websocket"
        if "api." in target:
            return "api"
        if "agent." in target:
            return "agent"
        if "exchange" in target:
            return "exchange"
        if "db." in target or "mongo" in target:
            return "db"
        if "news" in target:
            return "news"
        if "security" in target:
            return "security"
        if "service" in target:
            return "services"
        return "system"

    @staticmethod
    def _normalize_message(message: str) -> str:
        collapsed = " ".join(message.split())
        collapsed = _DYNAMIC_ID_PATTERN.sub("{id}", collapsed)
        collapsed = _NUMBER_PATTERN.sub("{n}", collapsed)
        return collapsed

    @staticmethod
    def _normalize_traceback(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if len(text) > _TRACEBACK_LIMIT:
            return text[:_TRACEBACK_LIMIT]
        return text

    @staticmethod
    def _extract_exception_type(traceback_text: str | None) -> str:
        if not traceback_text:
            return "UnknownError"

        for line in reversed(traceback_text.splitlines()):
            cleaned = line.strip()
            if not cleaned:
                continue
            if ":" in cleaned:
                return cleaned.split(":", 1)[0].strip()
            if cleaned.endswith("Error") or cleaned.endswith("Exception"):
                return cleaned

        return "UnknownError"

    @staticmethod
    def _extract_top_app_frame(traceback_text: str | None) -> str:
        if not traceback_text:
            return ""

        app_frames: list[str] = []
        for line in traceback_text.splitlines():
            stripped = line.strip()
            if "backend/app/" in stripped or "backend\\app\\" in stripped:
                app_frames.append(stripped)

        if app_frames:
            # Prefer the deepest app frame, which is usually closest to root cause.
            return app_frames[-1]
        return ""

    @staticmethod
    def _as_optional_str(value: Any) -> str | None:
        if value is None:
            return None
        string_value = str(value).strip()
        return string_value or None

    @staticmethod
    def _as_optional_int(value: Any) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None


_bug_automation_service: BugAutomationService | None = None


def get_bug_automation_service() -> BugAutomationService:
    """Return the singleton bug automation service instance."""
    global _bug_automation_service
    if _bug_automation_service is None:
        _bug_automation_service = BugAutomationService()
    return _bug_automation_service
