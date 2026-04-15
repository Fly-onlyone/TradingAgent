"""Agent session management endpoints for chat history persistence."""

from datetime import UTC, datetime, timedelta
from typing import Any

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_active_user
from app.db.models.agent_session import (
    AgentSession,
    PendingQuestionState,
    SessionMessage,
    delete_session_message_history,
    fetch_session_messages,
    persist_session_message,
)
from app.db.models.user import User

router = APIRouter()


# Request/Response schemas
class SessionCreate(BaseModel):
    title: str | None = Field(None, max_length=200)
    description: str | None = Field(None, max_length=500)


class SessionUpdate(BaseModel):
    title: str | None = Field(None, max_length=200)
    description: str | None = Field(None, max_length=500)


class MessageCreate(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str = Field(..., min_length=1)
    decision_id: str | None = None
    tool_calls: list[dict] | None = None
    tokens: int = 0


class MessageResponse(BaseModel):
    id: str | None = None  # AgentSessionMessage._id — used for in-place updates
    role: str
    content: str
    timestamp: str
    decision_id: str | None = None
    tool_calls: list[dict] | None = None
    thinking_content: str | None = None


class PendingQuestionResponse(BaseModel):
    id: str
    session_id: str
    question: str
    options: list[str]
    multi_select: bool = False
    created_at: datetime


class SessionResponse(BaseModel):
    id: str
    title: str | None
    description: str | None
    is_active: bool
    pending_question: PendingQuestionResponse | None = None

    # Statistics
    total_messages: int
    user_messages: int
    assistant_messages: int
    decisions_made: int
    trades_executed: int
    total_tokens: int
    symbols_discussed: list[str]

    # Timestamps
    started_at: datetime
    ended_at: datetime | None
    last_message_at: datetime | None

    class Config:
        from_attributes = True


class SessionWithMessagesResponse(SessionResponse):
    """Session response with messages."""

    messages: list[MessageResponse]


class SessionListResponse(BaseModel):
    """Paginated session list response."""

    sessions: list[SessionResponse]
    total: int
    page: int
    page_size: int


class MessageListResponse(BaseModel):
    """Paginated message list response."""

    messages: list[MessageResponse]
    total: int
    page: int
    page_size: int


class SessionsByDateGroup(BaseModel):
    """Sessions grouped by date."""

    date: str  # YYYY-MM-DD
    label: str  # "Today", "Yesterday", "Jan 28", etc.
    sessions: list[SessionResponse]


class GroupedSessionsResponse(BaseModel):
    """Sessions grouped by date for sidebar display."""

    groups: list[SessionsByDateGroup]
    total: int


def pending_question_to_response(
    question: PendingQuestionState | dict[str, Any] | None,
    session_id: str,
) -> PendingQuestionResponse | None:
    if question is None:
        return None

    if isinstance(question, PendingQuestionState):
        return PendingQuestionResponse(
            id=question.id,
            session_id=session_id,
            question=question.question,
            options=question.options,
            multi_select=question.multi_select,
            created_at=question.created_at,
        )

    created_at = question.get("created_at")
    if not isinstance(created_at, datetime):
        created_at = datetime.now(UTC)

    return PendingQuestionResponse(
        id=str(question.get("id", "")),
        session_id=session_id,
        question=str(question.get("question", "")),
        options=list(question.get("options", [])),
        multi_select=bool(question.get("multi_select", False)),
        created_at=created_at,
    )


def session_to_response(session: AgentSession) -> SessionResponse:
    return SessionResponse(
        id=str(session.id),
        title=session.title or session.generate_title(),
        description=session.description,
        is_active=session.is_active,
        pending_question=pending_question_to_response(
            session.active_pending_question,
            str(session.id),
        ),
        total_messages=session.total_messages,
        user_messages=session.user_messages,
        assistant_messages=session.assistant_messages,
        decisions_made=session.decisions_made,
        trades_executed=session.trades_executed,
        total_tokens=session.total_tokens,
        symbols_discussed=session.symbols_discussed,
        started_at=session.started_at,
        ended_at=session.ended_at,
        last_message_at=session.last_message_at,
    )


def session_summary_to_response(session: dict[str, Any]) -> SessionResponse:
    started_at = session["started_at"]
    generated_title = f"Session {started_at.strftime('%Y-%m-%d %H:%M')}"

    return SessionResponse(
        id=str(session["_id"]),
        title=session.get("title") or generated_title,
        description=session.get("description"),
        is_active=session.get("is_active", True),
        pending_question=pending_question_to_response(
            session.get("active_pending_question"),
            str(session["_id"]),
        ),
        total_messages=session.get("total_messages", 0),
        user_messages=session.get("user_messages", 0),
        assistant_messages=session.get("assistant_messages", 0),
        decisions_made=session.get("decisions_made", 0),
        trades_executed=session.get("trades_executed", 0),
        total_tokens=session.get("total_tokens", 0),
        symbols_discussed=session.get("symbols_discussed", []),
        started_at=started_at,
        ended_at=session.get("ended_at"),
        last_message_at=session.get("last_message_at"),
    )


def message_to_response(message: SessionMessage | dict) -> MessageResponse:
    if isinstance(message, SessionMessage):
        return MessageResponse(
            id=str(message.id) if message.id else None,
            role=message.role.value,
            content=message.content,
            timestamp=message.timestamp.isoformat(),
            decision_id=str(message.decision_id) if message.decision_id else None,
            tool_calls=message.tool_calls,
            thinking_content=message.thinking_content,
        )

    timestamp = message.get("timestamp", "")
    if isinstance(timestamp, datetime):
        timestamp = timestamp.isoformat()

    decision_id = message.get("decision_id")
    if decision_id is not None:
        decision_id = str(decision_id)

    raw_id = message.get("_id") or message.get("id")

    return MessageResponse(
        id=str(raw_id) if raw_id else None,
        role=message.get("role", ""),
        content=message.get("content", ""),
        timestamp=timestamp,
        decision_id=decision_id,
        tool_calls=message.get("tool_calls"),
        thinking_content=message.get("thinking_content"),
    )


def get_date_label(dt: datetime) -> tuple[str, str]:
    """Get date string and human-readable label for grouping."""
    # Legacy documents may contain naive datetimes; treat them as UTC.
    if dt.tzinfo is None or dt.utcoffset() is None:
        dt = dt.replace(tzinfo=UTC)
    else:
        dt = dt.astimezone(UTC)

    now = datetime.now(UTC)
    date_str = dt.strftime("%Y-%m-%d")

    if dt.date() == now.date():
        return date_str, "Today"
    if dt.date() == (now - timedelta(days=1)).date():
        return date_str, "Yesterday"
    if (now - dt).days < 7:
        return date_str, dt.strftime("%A")  # Day name
    else:
        return date_str, dt.strftime("%b %d")  # "Jan 28"


@router.post("", response_model=SessionResponse)
async def create_session(
    session_data: SessionCreate,
    current_user: User = Depends(get_current_active_user),
) -> SessionResponse:
    """Create a new chat session."""
    session = AgentSession(
        user_id=current_user.id,
        title=session_data.title,
        description=session_data.description,
    )
    await session.insert()
    return session_to_response(session)


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    is_active: bool | None = None,
    symbol: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List user's chat sessions with filtering and pagination."""
    query = AgentSession.find(AgentSession.user_id == current_user.id)

    if is_active is not None:
        query = query.find(AgentSession.is_active == is_active)
    if symbol:
        query = query.find({"symbols_discussed": symbol})

    total = await query.count()

    sessions = (
        await query.sort("-last_message_at", "-started_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return {
        "sessions": [session_to_response(s) for s in sessions],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/grouped", response_model=GroupedSessionsResponse)
async def list_sessions_grouped(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """List sessions grouped by date for sidebar display."""
    collection = AgentSession.get_pymongo_collection()
    sessions = await collection.aggregate(
        [
            {"$match": {"user_id": current_user.id}},
            {"$sort": {"last_message_at": -1, "started_at": -1}},
            {"$limit": limit},
            {
                "$project": {
                    "title": 1,
                    "description": 1,
                    "is_active": 1,
                    "total_messages": 1,
                    "user_messages": 1,
                    "assistant_messages": 1,
                    "decisions_made": 1,
                    "trades_executed": 1,
                    "total_tokens": 1,
                    "symbols_discussed": 1,
                    "started_at": 1,
                    "ended_at": 1,
                    "last_message_at": 1,
                    "active_pending_question": 1,
                }
            },
        ]
    ).to_list(length=limit)

    # Group by date
    groups_dict: dict[str, dict] = {}
    for session in sessions:
        # Use last_message_at or started_at for grouping
        group_time = session.get("last_message_at") or session["started_at"]
        date_str, label = get_date_label(group_time)

        if date_str not in groups_dict:
            groups_dict[date_str] = {"date": date_str, "label": label, "sessions": []}

        groups_dict[date_str]["sessions"].append(session_summary_to_response(session))

    sorted_groups = sorted(groups_dict.values(), key=lambda g: g["date"], reverse=True)

    return {
        "groups": [
            SessionsByDateGroup(date=g["date"], label=g["label"], sessions=g["sessions"])
            for g in sorted_groups
        ],
        "total": len(sessions),
    }


@router.get("/{session_id}", response_model=SessionWithMessagesResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Get a specific session with all messages."""
    session = await AgentSession.find_one(
        AgentSession.id == PydanticObjectId(session_id),
        AgentSession.user_id == current_user.id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    response = session_to_response(session).model_dump()
    messages, _ = await fetch_session_messages(session)
    response["messages"] = [message_to_response(m) for m in messages]
    return response


@router.get("/{session_id}/messages", response_model=MessageListResponse)
async def get_session_messages(
    session_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Get paginated messages for a session."""
    session = await AgentSession.find_one(
        AgentSession.id == PydanticObjectId(session_id),
        AgentSession.user_id == current_user.id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    start_idx = (page - 1) * page_size
    messages, total = await fetch_session_messages(
        session,
        skip=start_idx,
        limit=page_size,
    )

    return {
        "messages": [message_to_response(m) for m in messages],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/{session_id}/messages", response_model=MessageResponse)
async def add_message(
    session_id: str,
    message_data: MessageCreate,
    current_user: User = Depends(get_current_active_user),
) -> MessageResponse:
    """Add a message to a session."""
    session = await AgentSession.find_one(
        AgentSession.id == PydanticObjectId(session_id),
        AgentSession.user_id == current_user.id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session is closed")

    decision_id = None
    if message_data.decision_id:
        decision_id = PydanticObjectId(message_data.decision_id)

    message = await persist_session_message(
        session,
        role=message_data.role,
        content=message_data.content,
        decision_id=decision_id,
        tool_calls=message_data.tool_calls,
        tokens=message_data.tokens,
    )
    await session.save()

    return message_to_response(message)


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    session_data: SessionUpdate,
    current_user: User = Depends(get_current_active_user),
) -> SessionResponse:
    """Update session title or description."""
    session = await AgentSession.find_one(
        AgentSession.id == PydanticObjectId(session_id),
        AgentSession.user_id == current_user.id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_data.title is not None:
        session.title = session_data.title
    if session_data.description is not None:
        session.description = session_data.description

    await session.save()
    return session_to_response(session)


@router.post("/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
) -> SessionResponse:
    """End/close a session."""
    session = await AgentSession.find_one(
        AgentSession.id == PydanticObjectId(session_id),
        AgentSession.user_id == current_user.id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.end_session()
    await session.save()
    return session_to_response(session)


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Delete a session and all its messages."""
    session = await AgentSession.find_one(
        AgentSession.id == PydanticObjectId(session_id),
        AgentSession.user_id == current_user.id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await delete_session_message_history(session.id)
    await session.delete()
    return {"message": "Session deleted successfully"}
