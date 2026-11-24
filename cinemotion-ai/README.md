# CINEMOTION Independent AI

A Gemini-independent cinematic prompt generation service.

## Architecture

- Base model: Qwen3.5-4B GGUF, Q4_K_M (Apache-2.0 upstream model).
- Runtime: llama.cpp server, running locally or on a machine you control.
- Orchestration API: FastAPI.
- Prompt logic: CINEMOTION cinematic system instructions and request context.
- Training data: JSONL examples in `training/`; fine-tuning is a later phase after a reviewed dataset exists.

This service does not call Gemini, Firebase AI Logic, OpenAI, or another hosted model API.

## Important deployment boundary

The current website is a static GitHub-hosted frontend. A model cannot safely run inside GitHub Pages. The model server must run on a PC or a server you control. For the first milestone, run it locally on Windows and connect the frontend only for local testing. For a public website, deploy this same service and llama.cpp runtime on a dedicated server with sufficient RAM/CPU/GPU, HTTPS, authentication, rate limits, and monitoring.

Do not expose the llama.cpp port directly to the public internet.

## 1. Install the local model runtime (Windows)

Install a current llama.cpp Windows build that supports the Qwen3.5 architecture. Then start the model server in PowerShell:

```powershell
llama-server -hf ggml-org/Qwen3.5-4B-GGUF:Q4_K_M -c 8192 -ngl 0 --host 127.0.0.1 --port 8081
```

The first run downloads the quantized model. Keep this terminal open. The Q4_K_M weights are roughly 2.7-3 GB; runtime memory is higher because context/KV cache and process overhead also need RAM.

## 2. Start the CINEMOTION API

```powershell
cd cinemotion-ai
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

## 3. Test

Open `http://127.0.0.1:8000/health`. Then test generation:

```powershell
$body = @{
  brief = "Oka pedda dragon meghala madhya nunchi slow ga bayataki ravali."
  duration_seconds = 10
  language = "auto"
  conversation = @()
  specialist_context = @("Camera Director", "Lighting Director")
  vfx_context = @()
  vault_context = ""
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Uri http://127.0.0.1:8000/v1/prompt-engine/generate -Method Post -ContentType "application/json" -Body $body
```

## Current milestone

This is the independent inference/API foundation. It is not yet a fine-tuned CINEMOTION model. The next phases are: connect the existing Prompt Engine UI to this API, curate high-quality cinematic examples, evaluate Telugu/Romanized Telugu outputs, then fine-tune adapters on a suitable training machine.

## Hardware note

A GT 730 is not suitable for modern model GPU inference or fine-tuning. With 32 GB system RAM, Q4 CPU inference may run, but it will be slower. Fine-tuning should use a separate GPU machine or rented compute; the website's live users should not depend on this desktop PC staying online.
