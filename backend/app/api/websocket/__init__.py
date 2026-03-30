"""WebSocket routes."""

from fastapi import APIRouter

from app.api.websocket import agent, market, orders

router = APIRouter()

router.include_router(market.router, prefix="/market", tags=["ws-market"])
router.include_router(orders.router, prefix="/orders", tags=["ws-orders"])
router.include_router(agent.router, prefix="/agent", tags=["ws-agent"])
