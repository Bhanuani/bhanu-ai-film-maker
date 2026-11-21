const FLOW_CONNECTOR_MESSAGE = "CINEMOTION_FLOW_FILL";
if (!window.__cinemotionFlowBridgeInstalled) {
  window.__cinemotionFlowBridgeInstalled = true;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function visible(el) {
    if (!el || el.hidden || el.disabled) return false;
    try {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity || 1) > 0 && el.getClientRects().length > 0;
    } catch (_) { return false; }
  }

  function deepQueryAll(selector) {
    const found = [];
    const visit = root => {
      try { found.push(...root.querySelectorAll(selector)); } catch (_) {}
      let all = [];
      try { all = root.querySelectorAll("*"); } catch (_) {}
      for (const el of all) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(document);
    return [...new Set(found)];
  }

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").replace(/\\s+/g, " ").trim();
  }

  function scorePromptElement(el) {
    const meta = [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("name"), el.getAttribute("data-placeholder"), el.getAttribute("title"), el.getAttribute("aria-describedby")].join(" ").toLowerCase();
    const surrounding = (el.closest("main")?.innerText || "").slice(0, 500).toLowerCase();
    let score = 0;
    if (/prompt|describe|what.*create|generate|write.*video|video.*prompt|create.*video/i.test(meta)) score += 70;
    if (/search|email|password|login|comment|filter|project name/i.test(meta)) score -= 100;
    if (el.tagName === "TEXTAREA") score += 30;
    if (el.isContentEditable || el.getAttribute("contenteditable") === "true") score += 35;
    if (el.getAttribute("role") === "textbox") score += 20;
    if (el.closest("main")) score += 8;
    if (/video|prompt|create/i.test(surrounding)) score += 3;
    if ((el.value || el.textContent || "").length > 500) score -= 15;
    return score;
  }

  function findPrompt() {
    const selectors = 'textarea, input:not([type="hidden"]):not([type="file"]), [contenteditable="true"], [role="textbox"]';
    const candidates = deepQueryAll(selectors).filter(visible).filter(el => !el.readOnly && !el.disabled);
    candidates.sort((a,b) => scorePromptElement(b)-scorePromptElement(a));
    const best = candidates[0];
    return best && scorePromptElement(best) >= 18 ? best : null;
  }

  function findNewProjectTarget() {
    const selectors = 'button, [role="button"], a';
    const candidates = deepQueryAll(selectors).filter(visible);
    const match = candidates.find(el => /^new project$/i.test(textOf(el)) || /new project/i.test(el.getAttribute("aria-label") || ""));
    if (match) return match;
    // Flow's home screen sometimes renders the card as a clickable non-button.
    const loose = deepQueryAll('div, span').filter(visible).find(el => /^new project$/i.test(textOf(el)) && textOf(el).length < 40);
    return loose?.closest('button, [role="button"], a') || loose || null;
  }

  function clickLikeUser(target) {
    if (!target) return;
    target.scrollIntoView?.({block:"center", inline:"center"});
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width/2, y = rect.top + rect.height/2;
    for (const type of ["pointerdown","mousedown","pointerup","mouseup","click"]) {
      try { target.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y,button:0})); } catch (_) {}
    }
    try { target.click(); } catch (_) {}
  }

  async function openNewProjectIfNeeded() {
    if (findPrompt()) return true;
    const target = findNewProjectTarget();
    if (target) {
      clickLikeUser(target);
      await sleep(1200);
      // Flow navigation/project creation may take several seconds.
      return true;
    }
    return false;
  }

  async function waitForPrompt(timeoutMs = 9000) {
    if (findPrompt()) return findPrompt();
    await openNewProjectIfNeeded();
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const prompt = findPrompt();
      if (prompt) return prompt;
      await sleep(400);
    }
    return null;
  }
  function setPromptValue(el, value) {
    el.focus();
    if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
      el.replaceChildren(document.createTextNode(value));
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
    // Look for Flow's image/media file input. Hidden inputs are intentionally included.
    const inputs = deepQueryAll('input[type="file"]').filter(input => {
      const accept=(input.getAttribute("accept")||"").toLowerCase();
      return !accept || /image|video|media/.test(accept);
    });
    const input=inputs.find(el=>el.multiple)||inputs[0];
    if (!input) throw new Error("Prompt was inserted, but Flow's upload input wasn't found. Attach reference files manually.");
    const files=refs.map(base64ToFile);
    const transfer=new DataTransfer();
    files.forEach(file=>transfer.items.add(file));
    input.files=transfer.files;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    await sleep(2500);
    return files.length;
  }

  async function fillFlow(payload) {
    if (!location.hostname.endsWith("labs.google") || !location.pathname.includes("/fx/tools/flow")) return {ok:false,message:"Not on Google Flow."};
    const prompt=await waitForPrompt();
    if (!prompt) return {ok:false,retry:true,message:"Flow is opening a new project. Retrying prompt detection…"};
    setPromptValue(prompt,String(payload.prompt||""));
    await sleep(700);
    const actualValue = prompt.isContentEditable ? prompt.textContent : prompt.value;
    if (!actualValue || !actualValue.trim()) return {ok:false,message:"Flow prompt field was found, but text insertion was rejected by the editor. Please click the prompt box and use Resend to Flow again."};
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
