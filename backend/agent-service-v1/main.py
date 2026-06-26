"""FastAPI entry — wire routes only; no agent logic here."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import bills, chat, health, images

app = FastAPI(
    title="Sous Chef Agent Service v1",
    version="0.1.0",
    description="Workflow-first kitchen agent orchestrator",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(bills.router, tags=["bills"])
app.include_router(images.router, tags=["images"])
# Legacy path used by Next.js agent-chat.ts
app.include_router(chat.router, tags=["chat"])
# Versioned alias
app.include_router(chat.router, prefix="/v1", tags=["chat-v1"])


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "agent-service-v1", "status": "ok"}
