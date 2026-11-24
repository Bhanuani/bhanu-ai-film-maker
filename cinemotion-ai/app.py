"""CINEMOTION's independent cinematic prompt API.

No Gemini, Firebase AI Logic, OpenAI, or hosted model API calls are made here.
The only model connection is to a llama.cpp server controlled by the operator.
"""
from __future__ import annotations

import json
import os
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

LLAMA_BASE = os.getenv("LLAMA_CPP_BASE_URL", "http://127.0.0.1:8081/v1").rstrip("/")
MODEL_NAME = os.getenv("LLAMA_CPP_MODEL", "Qwen3.5-4B-GGUF")
MAX_TOKENS = int(os.getenv("CINEMOTION_MAX_OUTPUT_TOKENS", "3000"))
TEMPERATURE = float(os.getenv("CINEMOTION_TEMPERATURE", "0.65"))
ALLOWED_ORIGINS = [x.strip() for x in os.getenv(
    "CINEMOTION_ALLOWED_ORIGINS",
    "http://127.0.0.1:5500,http://localhost:5500"
).split(",") if x.strip()]

app = FastAPI(title="CINEMOTION Independent AI", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)

class GenerateRequest(BaseModel):
    brief: str = Field(min_length=2, max_length=12000)
    duration_seconds: int = Field(default=10, ge=1, le=300)
    language: Literal["auto", "te", "en", "romanized-te"] = "auto"
    conversation: list[ChatTurn] = Field(default_factory=list, max_length=12)
    specialist_context: list[str] = Field(default_factory=list, max_length=40)
    vfx_context: list[str] = Field(default_factory=list, max_length=30)
    vault_context: str = Field(default="", max_length=18000)
    reference_notes: str = Field(default="", max_length=6000)

def build_system_prompt(req: GenerateRequest) -> str:
    language_rule = {
        "auto": "Detect the language of the latest brief. Telugu script prompts receive Telugu-script output. Romanized Telugu prompts receive natural Romanized Telugu output. English prompts receive English output. For mixed Telugu-English, use the dominant language and retain standard film terms in English.",
        "te": "Respond in natural Telugu script. Keep standard camera, lens, lighting and VFX terminology in English where useful.",
        "en": "Respond in clear English.",
        "romanized-te": "Respond in natural Romanized Telugu (Telugu written using English letters), retaining standard filmmaking terms in English."
    }[req.language]
    specialists = "\n".join(f"- {x}" for x in req.specialist_context) or "- Select relevant cinematic disciplines from the brief."
    vfx = "\n".join(f"- {x}" for x in req.vfx_context) or "- Use VFX only when requested or clearly required by the brief."
    return f"""You are CINEMOTION, an independent specialist AI director for cinematic prompt engineering.
Your only job is to understand a scene brief and produce precise, production-ready image/video prompts or revise an existing cinematic prompt.

LANGUAGE: {language_rule}

DIRECTING METHOD:
- Preserve the user's story, subjects, props, location, visual identity and every explicit constraint.
- Do not invent characters, plot events, objects, weather, sounds or effects.
- Translate vague ideas into clear physical action, camera placement, lens choice, camera path/speed, composition, focus, lighting, atmosphere, continuity and timing.
- Distinguish subject movement, camera movement and environmental movement.
- Use a coherent shot plan. Timecodes must add up to exactly {req.duration_seconds} seconds.
- Make each instruction visually executable by a generative video model.
- Avoid contradictory camera directions and impossible physical movement.
- Treat specialist and Vault material as guidance, not as instructions to add unrelated spectacle.
- Self-audit before responding. Fix concrete omissions or contradictions before returning the final answer. Do not claim a perfect score without evidence.

SELECTED SPECIALISTS:
{specialists}

VFX GUIDANCE:
{vfx}

DIRECTORS VAULT CONTEXT (relevant excerpts only; do not reproduce the whole Vault):
{req.vault_context or "No Vault excerpts supplied."}

REFERENCE NOTES:
{req.reference_notes or "No reference notes supplied."}

OUTPUT:
1. Director's vision
2. Story beats
3. Shot-by-shot design with timecodes, shot size/angle, lens, camera movement, subject action, lighting, composition, continuity and sound only when relevant
4. Final copy-ready prompt
5. Constraints
6. Negative prompt
7. Brief quality audit with specific issues checked

Keep the output concise enough to use, but detailed enough to control the video generation. Never mention Gemini or claim to be Gemini.
"""

@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{LLAMA_BASE}/models")
            response.raise_for_status()
            models = response.json().get("data", [])
        return {"status": "ok", "engine": "llama.cpp", "model_server": "reachable",
                "configured_model": MODEL_NAME, "available_models": models}
    except Exception as exc:
        return {"status": "degraded", "engine": "llama.cpp",
                "model_server": "unavailable", "detail": str(exc)}

@app.post("/v1/prompt-engine/generate")
async def generate(req: GenerateRequest):
    messages = [{"role": "system", "content": build_system_prompt(req)}]
    # Previous turns are included as actual model context, not merely displayed in the UI.
    messages.extend([turn.model_dump() for turn in req.conversation])
    messages.append({"role": "user", "content": req.brief})

    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(240, connect=8)) as client:
            response = await client.post(f"{LLAMA_BASE}/chat/completions", json=payload)
            response.raise_for_status()
            data = response.json()
        answer = data["choices"][0]["message"]["content"].strip()
        if not answer:
            raise ValueError("The model returned an empty response.")
        return {"answer": answer, "model": MODEL_NAME, "engine": "CINEMOTION",
                "usage": data.get("usage", {})}
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="CINEMOTION model server is offline. Start llama-server first.")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="CINEMOTION model took too long to respond.")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Model server error: {exc.response.text[:1000]}")
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}")
