# Start this in a separate PowerShell window. Install a recent llama.cpp build first.
$ErrorActionPreference = "Stop"
llama-server -hf "ggml-org/Qwen3.5-4B-GGUF:Q4_K_M" -c 8192 -ngl 0 --host 127.0.0.1 --port 8081
