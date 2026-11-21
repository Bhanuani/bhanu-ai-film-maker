const FLOW_CONNECTOR_MESSAGE = "CINEMOTION_FLOW_FILL";

function visible(el) {
  if (!el || el.hidden || el.disabled) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && el.getClientRects().length > 0;
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
  const meta = [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("name"), el.getAttribute("data-placeholder"), el.getAttribute("title"), el.getAttribute("aria-describedby")].join(" ").toLowerCase();
  let score = 0;
  if (/what do you want to create|prompt|describe|create|generate|ask flow|write/i.test(meta)) score += 20;
  if (/search|email|password|login|comment|filter/i.test(meta)) score -= 40;
  if (el.tagName === "TEXTAREA") score += 8;
  if (el.isContentEditable || el.getAttribute("contenteditable") === "true") score += 10;
  if (el.getAttribute("role") === "textbox") score += 5;
  if (el.closest("main")) score += 2;
  return score;
}
async function waitForPrompt(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const candidates = deepQueryAll('textarea, input:not([type]), input[type="text"], [contenteditable="true"], [role="textbox"]')
      .filter(visible)
      .filter(el => !el.readOnly && !el.disabled);
    candidates.sort((a, b) => scorePromptElement(b) - scorePromptElement(a));
    if (candidates.length && scorePromptElement(candidates[0]) > 0) return candidates[0];
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}
function setPromptValue(el, value) {
  el.focus();
  if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value); else el.value = value;
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
  if (!input) throw new Error("Prompt was filled, but Flow's media upload input was not detected. Please attach references manually.");
  const files = refs.map(base64ToFile);
  const transfer = new DataTransfer();
  files.forEach(file => transfer.items.add(file));
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 1200));
  return files.length;
}
async function fillFlow(payload) {
  if (!location.hostname.endsWith("labs.google") || !location.pathname.includes("/fx/tools/flow")) {
    return { ok: false, message: "This tab is not Google Flow." };
  }
  const promptEl = await waitForPrompt();
  if (!promptEl) return { ok: false, message: "Google Flow opened, but its prompt composer was not detected. Open the Flow creation screen and retry." };

  // IMPORTANT: Fill the prompt first. Reference-upload failures must never block prompt transfer.
  setPromptValue(promptEl, String(payload.prompt || ""));
  let attached = 0;
  let mediaWarning = "";
  try {
    attached = await attachReferences(payload.references || []);
  } catch (error) {
    mediaWarning = " " + (error?.message || "Reference media could not be attached.");
  }
  return {
    ok: true,
    message: "Prompt inserted into Flow" + (attached ? " and " + attached + " reference file(s) attached." : ".") + mediaWarning + " Review it and click Generate yourself."
  };
}
if (window.__cinemotionFlowBridgeInstalled) { /* prevent duplicate injection */ } else { window.__cinemotionFlowBridgeInstalled = true;\nchrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== FLOW_CONNECTOR_MESSAGE) return;
  fillFlow(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error?.message || "Flow fill failed." }));
  return true;
});
