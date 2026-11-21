window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "cinemotion-studio" || event.data?.type !== "CINEMOTION_SEND_TO_FLOW") return;
  const { requestId, prompt, references } = event.data;
  if (!requestId || !prompt) return;
  try {
    chrome.runtime.sendMessage({
      type: "CINEMOTION_SEND_TO_FLOW",
      payload: { requestId, prompt, references: Array.isArray(references) ? references : [] }
    }, (result) => {
      const runtimeError = chrome.runtime.lastError;
      window.postMessage({
        source: "cinemotion-flow-extension",
        requestId,
        ok: !runtimeError && !!result?.ok,
        message: runtimeError?.message || result?.message || (result?.ok ? "Prompt and references sent to Flow." : "Flow handoff failed.")
      }, "*");
    });
  } catch (error) {
    window.postMessage({ source: "cinemotion-flow-extension", requestId, ok: false, message: error?.message || "Extension bridge failed." }, "*");
  }
});