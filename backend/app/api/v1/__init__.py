"""API v1 routes."""

from fastapi import APIRouter

from app.api.v1 import (
    agent_decisions,
    agent_sessions,
    agent_tasks,
    auth,
    knowledge,
    market,
    news,
    notifications,
    orders,
    strategies,
)

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(orders.router, prefix="/orders", tags=["orders"])
router.include_router(strategies.router, prefix="/strategies", tags=["strategies"])
router.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])
router.include_router(news.router, prefix="/news", tags=["news"])
router.include_router(market.router, prefix="/market", tags=["market"])
router.include_router(agent_tasks.router, prefix="/agent/tasks", tags=["agent-tasks"])
router.include_router(
    agent_sessions.router, prefix="/agent/sessions", tags=["agent-sessions"]
)
router.include_router(
    agent_decisions.router, prefix="/agent/decisions", tags=["agent-decisions"]
)
router.include_router(
    notifications.router, prefix="/notifications", tags=["notifications"]
)
