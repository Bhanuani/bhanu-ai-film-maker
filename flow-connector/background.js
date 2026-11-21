const FLOW_URL = "https://labs.google/fx/tools/flow/";

async function getOrOpenFlowTab() {
  const tabs = await chrome.tabs.query({ url: ["https://labs.google/fx/tools/flow/*", "https://labs.google/fx/tools/flow"] });
  if (tabs.length) {
    const tab = tabs[0];
    if (tab.id) await chrome.tabs.update(tab.id, { active: true });
    return tab;
  }
  return chrome.tabs.create({ url: FLOW_URL, active: true });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function sendToFlowTab(tabId, payload) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "CINEMOTION_FLOW_FILL", payload });
      return result;
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }
  throw new Error("Flow Connector could not reach the Google Flow tab. Reload the Flow tab and try again. " + (lastError?.message || ""));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CINEMOTION_SEND_TO_FLOW") return;
  (async () => {
    try {
      const tab = await getOrOpenFlowTab();
      if (!tab.id) throw new Error("Could not open Google Flow tab.");
      const result = await sendToFlowTab(tab.id, message.payload);
      sendResponse(result || { ok: false, message: "Flow did not return a result." });
    } catch (error) {
      sendResponse({ ok: false, message: error?.message || "Unexpected Flow connector error." });
    }
  })();
  return true;
});