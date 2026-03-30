"""API v1 routes."""

from fastapi import APIRouter

from app.api.v1 import (
    admin,
    agent_decisions,
    agent_sessions,
    agent_tasks,
    auth,
    client_logs,
    knowledge,
    logs,
    market,
    news,
    notifications,
    orders,
    settings,
    strategies,
    strategy_import,
    strategy_ratings,
    users,
)

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(orders.router, prefix="/orders", tags=["orders"])
router.include_router(strategy_import.router, prefix="/strategies/import", tags=["strategy-import"])
router.include_router(
    strategy_ratings.router, prefix="/strategies/ratings", tags=["strategy-ratings"]
)
router.include_router(strategies.router, prefix="/strategies", tags=["strategies"])
router.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])
router.include_router(news.router, prefix="/news", tags=["news"])
router.include_router(market.router, prefix="/market", tags=["market"])
router.include_router(agent_tasks.router, prefix="/agent/tasks", tags=["agent-tasks"])
router.include_router(agent_sessions.router, prefix="/agent/sessions", tags=["agent-sessions"])
router.include_router(agent_decisions.router, prefix="/agent/decisions", tags=["agent-decisions"])
router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
router.include_router(settings.router, prefix="/settings", tags=["settings"])
router.include_router(client_logs.router, prefix="/logs", tags=["logs"])
router.include_router(logs.router, prefix="/admin/logs", tags=["logs"])
router.include_router(admin.router, prefix="/admin", tags=["admin"])
