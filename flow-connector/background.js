const FLOW_URL = "https://flow.google/";
const FLOW_URL_PATTERNS = ["https://flow.google/*", "https://labs.google/fx/tools/flow/*", "https://labs.google/fx/tools/flow"];
async function getOrOpenFlowTab() {
  const tabs = await chrome.tabs.query({ url: FLOW_URL_PATTERNS });
  if (tabs.length) {
    const tab = tabs.find(t => t.url && (t.url.startsWith("https://flow.google/") || t.url.startsWith("https://labs.google/fx/tools/flow"))) || tabs[0];
    if (tab.id) await chrome.tabs.update(tab.id, { active: true });
    return tab;
  }
  return chrome.tabs.create({ url: FLOW_URL, active: true });
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitForTabReady(tabId, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { const tab = await chrome.tabs.get(tabId); if (tab.status === "complete") return tab; } catch (_) {}
    await delay(400);
  }
  throw new Error("Google Flow is still loading. Wait for it to finish, then click Resend to Flow.");
}
async function injectFlowBridge(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["flow-bridge.js"] });
  await delay(400);
}
async function sendToFlowTab(tabId, payload) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt++) {
    await waitForTabReady(tabId, 30000);
    try {
      await injectFlowBridge(tabId);
      const result = await chrome.tabs.sendMessage(tabId, { type: "CINEMOTION_FLOW_FILL", payload });
      if (result?.ok) return result;
      if (result?.retry) { lastError = new Error(result.message || "Flow project is opening."); await delay(1800); continue; }
      if (result) return result;
      lastError = new Error("Flow bridge returned no response.");
    } catch (error) { lastError = error; }
    await delay(1000);
  }
  throw new Error(lastError?.message || "Flow prompt editor was not detected. Open New project and click Resend to Flow.");
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CINEMOTION_SEND_TO_FLOW") return;
  (async () => {
    try {
      const tab = await getOrOpenFlowTab();
      if (!tab.id) throw new Error("Could not open Google Flow tab.");
      const result = await sendToFlowTab(tab.id, message.payload);
      sendResponse(result || { ok: false, message: "Flow did not return a result." });
    } catch (error) { sendResponse({ ok: false, message: error?.message || "Unexpected Flow connector error." }); }
  })();
  return true;
});