const FLOW_CONNECTOR_MESSAGE = "CINEMOTION_FLOW_FILL";

function visible(el) {
  if (!el || el.hidden || el.disabled) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && (el.getClientRects().length > 0 || el.type === "file");
}
function deepQueryAll(selector) {
  const found = [];
  const visit = root => {
    try { found.push(...root.querySelectorAll(selector)); } catch (_) {}
    const all = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const el of all) if (el.shadowRoot) visit(el.shadowRoot);
  };
  visit(document);
  return [...new Set(found)];
}
function scorePromptElement(el) {
  const meta = [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("name"), el.getAttribute("data-placeholder"), el.getAttribute("title")].join(" ").toLowerCase();
  let score = 0;
  if (/prompt|describe|create|generate|ask flow|write/i.test(meta)) score += 15;
  if (/search|email|password|login|comment/i.test(meta)) score -= 30;
  if (el.tagName === "TEXTAREA") score += 5;
  if (el.isContentEditable || el.getAttribute("contenteditable") === "true") score += 7;
  if (el.getAttribute("role") === "textbox") score += 3;
  if (el.closest("main")) score += 2;
  return score;
}
async function waitForPrompt(timeoutMs = 28000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const candidates = deepQueryAll("textarea, input:not([type]), input[type=text], [contenteditable=true], [role=textbox]")
      .filter(visible)
      .filter(el => !el.readOnly && !el.disabled);
    candidates.sort((a,b) => scorePromptElement(b) - scorePromptElement(a));
    if (candidates.length && scorePromptElement(candidates[0]) > 0) return candidates[0];
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}
function setPromptValue(el, value) {
  if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.focus();
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function base64ToFile(ref) {
  const binary = atob(ref.base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], ref.name || "reference", { type: ref.mimeType || "image/png" });
}
async function attachReferences(refs) {
  if (!refs?.length) return 0;
  const inputs = deepQueryAll('input[type="file"]').filter(input => {
    const accept = (input.getAttribute("accept") || "").toLowerCase();
    return !accept || /image|video|media/.test(accept);
  });
  const input = inputs.find(el => el.multiple) || inputs[0];
  if (!input) throw new Error("Flow prompt field was found, but its upload input is not available. Please attach the references directly in Flow.");
  const files = refs.map(base64ToFile);
  const transfer = new DataTransfer();
  files.forEach(file => transfer.items.add(file));
  try { input.files = transfer.files; }
  catch (_) { throw new Error("Flow's upload field did not accept the reference files. Attach them directly in Flow."); }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 900));
  return files.length;
}
async function fillFlow(payload) {
  if (!location.hostname.endsWith("labs.google") || !location.pathname.includes("/fx/tools/flow")) {
    return { ok: false, message: "This tab is not Google Flow." };
  }
  const promptEl = await waitForPrompt();
  if (!promptEl) return { ok: false, message: "Flow opened, but no project prompt box was found. Open or create a Flow project, then click Send to Flow again." };
  let attached = 0;
  try { attached = await attachReferences(payload.references || []); }
  catch (error) { return { ok: false, message: error.message || "Could not attach reference files." }; }
  setPromptValue(promptEl, String(payload.prompt || ""));
  return { ok: true, message: "Prompt sent to Flow" + (attached ? " with " + attached + " reference file(s)." : ".") + " Review it in Flow and click Generate yourself." };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== FLOW_CONNECTOR_MESSAGE) return;
  fillFlow(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error?.message || "Flow fill failed." }));
  return true;
});