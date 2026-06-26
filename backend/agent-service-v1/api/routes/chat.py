"""Chat endpoint — delegates to supervisor graph."""

from fastapi import APIRouter, HTTPException

from api.schemas.chat import ChatRequest, ChatResponse
from supervisor.graph import run_supervisor_turn

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
def post_chat(body: ChatRequest) -> ChatResponse:
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="message required")

    result = run_supervisor_turn(body)
    return ChatResponse(**result)
