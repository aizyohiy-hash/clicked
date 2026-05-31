import json
import os

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="AI Agent API")

_SYSTEM_PROMPT = (
    "You are an AI assistant for Clicked, a decentralised messaging and payment "
    "platform built on the Stellar blockchain. Clicked lets users send token "
    "payments inside chat conversations, manage group treasuries, and participate "
    "in DAO-style governance. Help users with questions about transactions, wallet "
    "management, group finances, and platform features."
)

_HIGH_VALUE_THRESHOLD = 10_000.0


# ── Request / response models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    conversation_id: str


class ChatResponse(BaseModel):
    reply: str


class TransferAnalyseRequest(BaseModel):
    amount: float
    sender: str
    recipient: str
    memo: str


class TransferAnalyseResponse(BaseModel):
    flagged: bool
    reason: str | None
    confidence: float


# ── Helpers ───────────────────────────────────────────────────────────────────

def _openai_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
    from openai import OpenAI  # imported lazily so missing package gives a clear error
    return OpenAI(api_key=api_key)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    client = _openai_client()
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": request.message},
        ],
        timeout=30,
    )
    return ChatResponse(reply=response.choices[0].message.content)


@app.post("/transfers/analyse", response_model=TransferAnalyseResponse)
def analyse_transfer(request: TransferAnalyseRequest):
    # Rule-based: high-value transfers are always flagged with high confidence.
    if request.amount > _HIGH_VALUE_THRESHOLD:
        return TransferAnalyseResponse(
            flagged=True,
            reason=f"Amount {request.amount} XLM exceeds {_HIGH_VALUE_THRESHOLD} XLM threshold",
            confidence=0.99,
        )

    client = _openai_client()
    prompt = (
        "Analyse this Stellar transfer for fraud risk.\n"
        f"Amount: {request.amount} XLM\n"
        f"Sender: {request.sender}\n"
        f"Recipient: {request.recipient}\n"
        f"Memo: {request.memo}\n\n"
        "Reply with JSON only using keys: flagged (bool), reason (string under 100 chars or null), "
        "confidence (float 0-1). Flag if suspicious patterns are detected."
    )
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        timeout=10,
    )
    result = json.loads(response.choices[0].message.content)
    return TransferAnalyseResponse(
        flagged=bool(result.get("flagged", False)),
        reason=result.get("reason"),
        confidence=float(result.get("confidence", 0.0)),
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
