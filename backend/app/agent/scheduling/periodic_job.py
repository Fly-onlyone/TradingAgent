"""Reusable abstraction for interval-triggered background jobs.

Four jobs previously carried copy-pasted scheduling glue:
strategy discovery, pattern mining, session cleanup, news crawl.
Each had its own `_schedule_X`, `_run_X`, and `_maybe_run_missed_X`
pair that differed only in settings-field names. `PeriodicJob`
captures the shape once; each job supplies a `runner` plus the
three pieces that actually vary — enabled-check, interval, and
the name of the AppSettings field used to track last-run.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import sentry_sdk
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

if TYPE_CHECKING:
    from app.db.models.app_settings import AppSettings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PeriodicJob:
    """Descriptor for a periodic background job.

    Attributes:
        job_id: Stable APScheduler job id (also used to look up next_run_time).
        name: Human-friendly job name shown in logs and status dumps.
        last_run_field: Attr name on AppSettings to stamp on success.
            The manager will read/write `getattr(settings, last_run_field)`.
        enabled: Given the current AppSettings, should this job be scheduled?
        interval: Given the current AppSettings, how often should it fire?
        runner: The actual work. Should not raise; the manager wraps it.
        sentry_op: Optional Sentry transaction op name. `None` disables Sentry
            wrapping — used for jobs that historically did not report to Sentry.
        log_label: Short phrase used in log lines (e.g. "Strategy auto-discovery").
            Defaults to `name` if omitted.
    """

    job_id: str
    name: str
    last_run_field: str
    enabled: Callable[[AppSettings], Awaitable[bool]]
    interval: Callable[[AppSettings], timedelta]
    runner: Callable[[], Awaitable[None]]
    sentry_op: str | None = None
    log_label: str | None = None
    fire_when_settings_unavailable: bool = False
    """If True, fire one initial run even if AppSettings can't be loaded.

    News crawl historically did this — it has no enabled flag so a DB
    outage shouldn't silence the scheduler. Other jobs (discovery,
    mining) depend on an enabled flag, so bailing is the safer default.
    """


class PeriodicJobManager:
    """Registers `PeriodicJob`s on an APScheduler and handles catch-up runs.

    Responsibilities:
    - Read AppSettings and gate scheduling on `job.enabled`.
    - Add/remove the APScheduler job in idempotent fashion.
    - Wrap runners with Sentry + try/except + last-run persistence.
    - Fire a catch-up execution on startup (or after reschedule) if the
      last successful run is older than the configured interval.
    """

    def __init__(self, scheduler: AsyncIOScheduler) -> None:
        self._scheduler = scheduler

    async def register(self, job: PeriodicJob) -> None:
        """Schedule (or unschedule) a job based on current AppSettings.

        Safe to call on startup or after a settings-change. Existing
        scheduler jobs with the same id are replaced.
        """
        settings = await self._load_settings()
        if settings is None:
            logger.debug("Could not load AppSettings for %s", job.job_id)
            if job.fire_when_settings_unavailable:
                asyncio.create_task(self._run_and_persist(job))  # noqa: RUF006
            return

        if self._scheduler.get_job(job.job_id) is not None:
            self._scheduler.remove_job(job.job_id)

        if not await job.enabled(settings):
            return

        interval = job.interval(settings)
        self._scheduler.add_job(
            self._build_wrapped_runner(job),
            IntervalTrigger(seconds=interval.total_seconds()),
            id=job.job_id,
            name=job.name,
            replace_existing=True,
        )
        logger.info("%s scheduled every %s", job.log_label or job.name, interval)

        await self._maybe_catch_up(job, settings, interval)

    def unregister(self, job_id: str) -> None:
        """Remove a job from the scheduler if present."""
        if self._scheduler.get_job(job_id) is not None:
            self._scheduler.remove_job(job_id)

    def next_run_at(self, job_id: str) -> datetime | None:
        """Return the next scheduled fire time for a job, or None if not scheduled."""
        job = self._scheduler.get_job(job_id)
        return job.next_run_time if job else None

    def _build_wrapped_runner(self, job: PeriodicJob) -> Callable[[], Awaitable[None]]:
        """Return a closure that wraps the user runner with Sentry + persistence."""

        async def _run() -> None:
            await self._run_and_persist(job)

        return _run

    async def _run_and_persist(self, job: PeriodicJob) -> None:
        """Execute the runner inside a Sentry transaction; stamp last-run on success."""
        if job.sentry_op is not None:
            with sentry_sdk.start_transaction(op=job.sentry_op, name=job.job_id):
                await self._run_and_stamp(job)
        else:
            await self._run_and_stamp(job)

    async def _run_and_stamp(self, job: PeriodicJob) -> None:
        try:
            await job.runner()
        except Exception:
            logger.exception("%s cycle failed", job.log_label or job.name)
            return
        await self._stamp_last_run(job)

    async def _stamp_last_run(self, job: PeriodicJob) -> None:
        """Persist `*_last_run_at` on AppSettings so catch-up logic works after restart."""
        try:
            settings = await self._load_settings()
            if settings is None:
                return
            setattr(settings, job.last_run_field, datetime.now(UTC))
            await settings.save_with_timestamp()
        except Exception:
            logger.debug(
                "Could not persist %s for %s",
                job.last_run_field,
                job.job_id,
                exc_info=True,
            )

    async def _maybe_catch_up(
        self, job: PeriodicJob, settings: AppSettings, interval: timedelta
    ) -> None:
        """Fire one immediate run if we're overdue since last_run_at."""
        last_run: datetime | None = getattr(settings, job.last_run_field, None)
        label = job.log_label or job.name

        if last_run is None:
            logger.info("%s has never run — triggering initial run", label)
            asyncio.create_task(self._run_and_persist(job))  # noqa: RUF006
            return

        if last_run.tzinfo is None:
            last_run = last_run.replace(tzinfo=UTC)

        elapsed = datetime.now(UTC) - last_run
        if elapsed > interval:
            logger.info(
                "%s overdue by %s — triggering catch-up run",
                label,
                elapsed - interval,
            )
            asyncio.create_task(self._run_and_persist(job))  # noqa: RUF006

    async def _load_settings(self) -> AppSettings | None:
        """Load AppSettings, returning None on failure (callers should no-op)."""
        try:
            from app.db.models.app_settings import AppSettings

            return await AppSettings.get_instance()
        except Exception:
            return None
