const FLOW_URL = "https://flow.google/";
const FLOW_URL_PATTERNS = ["https://flow.google/*", "https://labs.google/fx/tools/flow/*", "https://labs.google/fx/tools/flow"];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getOrOpenFlowTab() {
  const tabs = await chrome.tabs.query({url: FLOW_URL_PATTERNS});
  if (tabs.length) {
    const tab = tabs.find(t => t.url && (t.url.startsWith("https://flow.google/") || t.url.startsWith("https://labs.google/fx/tools/flow"))) || tabs[0];
    if (tab.id) await chrome.tabs.update(tab.id, {active:true});
    return tab;
  }
  return chrome.tabs.create({url:FLOW_URL,active:true});
}
async function waitForTabReady(tabId, timeoutMs=30000) {
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    try{const tab=await chrome.tabs.get(tabId);if(tab.status==="complete")return tab;}catch{}
    await delay(400);
  }
  throw new Error("Google Flow is still loading. Wait, then resend.");
}
async function getNewProjectHref(tabId) {
  const result=await chrome.scripting.executeScript({target:{tabId},func:()=>{
    const visible=e=>e&&e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden";
    const els=[...document.querySelectorAll('a[href],button,[role="button"]')].filter(visible);
    const el=els.find(e=>/^\s*\+?\s*new project\s*$/i.test((e.innerText||e.textContent||"").replace(/\s+/g," ")));
    return el?(el.closest("a[href]")?.href||el.href||el.getAttribute("href")||null):null;
  }});
  return result?.[0]?.result||null;
}
async function openProject(tabId) {
  let tab=await waitForTabReady(tabId);
  if(tab.url?.includes("/project/")) return tab;
  // Reload once to clear stale injected bridge listeners from older connector versions.
  await chrome.tabs.reload(tabId);
  await waitForTabReady(tabId);
  const href=await getNewProjectHref(tabId);
  if(href && href.includes("/project/")) {
    await chrome.tabs.update(tabId,{url:href,active:true});
    return await waitForTabReady(tabId,45000);
  }
  // Fallback: click New project in the page itself.
  await chrome.scripting.executeScript({target:{tabId},func:()=>{
    const el=[...document.querySelectorAll('a[href],button,[role="button"]')].find(e=>/^\s*\+?\s*new project\s*$/i.test((e.innerText||e.textContent||"").replace(/\s+/g," ")));
    if(el)el.click();
  }});
  await delay(1500);
  return await waitForTabReady(tabId,45000);
}
async function sendToFlowTab(tabId,payload){
  const tab=await openProject(tabId);
  if(!tab.id)throw new Error("Flow project tab missing.");
  await chrome.scripting.executeScript({target:{tabId},files:["flow-bridge.js"]});
  await delay(500);
  const result=await chrome.tabs.sendMessage(tabId,{type:"CINEMOTION_FLOW_FILL",payload});
  if(result?.ok)return result;
  throw new Error(result?.message||"Project opened, but prompt transfer failed. Click Resend.");
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type!=="CINEMOTION_SEND_TO_FLOW")return;
  (async()=>{
    try{
      const tab=await getOrOpenFlowTab();
      if(!tab.id)throw new Error("Could not open Google Flow tab.");
      sendResponse(await sendToFlowTab(tab.id,message.payload));
    }catch(error){sendResponse({ok:false,message:error?.message||"Flow connector error."});}
  })();
  return true;
});