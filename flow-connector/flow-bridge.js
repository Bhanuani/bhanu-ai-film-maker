const FLOW_CONNECTOR_MESSAGE = "CINEMOTION_FLOW_FILL";
if (!window.__cinemotionFlowBridgeInstalled) {
  window.__cinemotionFlowBridgeInstalled = true;

  function visible(el) {
    if (!el || el.hidden || el.disabled) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity || 1) > 0 && el.getClientRects().length > 0;
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
    if (/prompt|describe|what.*create|generate|ask flow|write/i.test(meta)) score += 30;
    if (/search|email|password|login|comment|filter/i.test(meta)) score -= 50;
    if (el.tagName === "TEXTAREA") score += 8;
    if (el.isContentEditable || el.getAttribute("contenteditable") === "true") score += 15;
    if (el.getAttribute("role") === "textbox") score += 8;
    if (el.closest("main")) score += 2;
    return score;
  }

  function findPrompt() {
    const candidates = deepQueryAll('textarea, input:not([type]), input[type="text"], [contenteditable="true"], [role="textbox"]')
      .filter(visible).filter(el => !el.readOnly && !el.disabled);
    candidates.sort((a,b) => scorePromptElement(b)-scorePromptElement(a));
    return candidates.length && scorePromptElement(candidates[0]) >= 8 ? candidates[0] : null;
  }

  async function openNewProjectIfNeeded() {
    if (findPrompt()) return;
    const buttons = deepQueryAll('button, [role="button"], a').filter(visible);
    const newProject = buttons.find(el => /^\s*new project\s*$/i.test((el.innerText || el.textContent || "").trim()));
    if (newProject) {
      newProject.click();
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  async function waitForPrompt(timeoutMs = 45000) {
    await openNewProjectIfNeeded();
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const prompt = findPrompt();
      if (prompt) return prompt;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return null;
  }

  function setPromptValue(el, value) {
    el.focus();
    if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
      el.textContent = value;
      el.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertText", data:value}));
      el.dispatchEvent(new Event("change", {bubbles:true}));
      return;
    }
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertText", data:value}));
    el.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function base64ToFile(ref) {
    const binary = atob(ref.base64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return new File([bytes], ref.name || "reference", {type:ref.mimeType || "image/png"});
  }

  async function attachReferences(refs) {
    if (!refs?.length) return 0;
    const inputs = deepQueryAll('input[type="file"]').filter(input => {
      const accept=(input.getAttribute("accept")||"").toLowerCase();
      return !accept || /image|video|media/.test(accept);
    });
    const input=inputs.find(el=>el.multiple)||inputs[0];
    if (!input) throw new Error("Prompt filled, but Flow upload control was not found. Attach references manually.");
    const files=refs.map(base64ToFile);
    const transfer=new DataTransfer();
    files.forEach(file=>transfer.items.add(file));
    input.files=transfer.files;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    await new Promise(r=>setTimeout(r,1500));
    return files.length;
  }

  async function fillFlow(payload) {
    if (!location.hostname.endsWith("labs.google") || !location.pathname.includes("/fx/tools/flow")) return {ok:false,message:"Not on Google Flow."};
    const promptEl=await waitForPrompt();
    if (!promptEl) return {ok:false,message:"Flow home was opened, but prompt box was not found. Click New project once, wait for the editor, then click Resend to Flow."};
    setPromptValue(promptEl,String(payload.prompt||""));
    let attached=0, warning="";
    try { attached=await attachReferences(payload.references||[]); }
    catch(e) { warning=" Reference upload issue: "+(e?.message||"attach manually."); }
    return {ok:true,message:"Prompt inserted into Flow"+(attached?" and "+attached+" reference file(s) attached.":".")+warning+" Review it and click Generate yourself."};
  }

  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if (message?.type!==FLOW_CONNECTOR_MESSAGE) return;
    fillFlow(message.payload||{}).then(sendResponse).catch(error=>sendResponse({ok:false,message:error?.message||"Flow fill failed."}));
    return true;
  });
}
