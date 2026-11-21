// Cinemotion Studio Google Flow connector — robust prompt editor detection/fill.
(() => {
  const MESSAGE = "CINEMOTION_FLOW_FILL";
  if (window.__cinemotionFlowBridgeV2) return;
  window.__cinemotionFlowBridgeV2 = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => {
    if (!el || el.disabled || el.hidden) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity || 1) > 0 && el.getClientRects().length > 0;
  };
  function deepAll(selector) {
    const out = [];
    const walk = root => {
      try { out.push(...root.querySelectorAll(selector)); } catch {}
      let nodes=[]; try { nodes=root.querySelectorAll("*"); } catch {}
      for (const n of nodes) if (n.shadowRoot) walk(n.shadowRoot);
    };
    walk(document); return [...new Set(out)];
  }
  const meta = el => [el.getAttribute("placeholder"),el.getAttribute("aria-label"),el.getAttribute("data-placeholder"),el.getAttribute("name"),el.getAttribute("title")].join(" ").toLowerCase();
  function findPrompt() {
    const selectors='textarea, [contenteditable="true"], [role="textbox"], input:not([type="hidden"]):not([type="file"])';
    const list=deepAll(selectors).filter(visible).filter(el=>!el.readOnly && !el.disabled);
    list.sort((a,b)=>{
      const score=el=>{
        const m=meta(el); let n=0;
        if (/prompt|describe|create|video|image|generate|write/.test(m)) n+=100;
        if (/search|email|password|login|comment|filter|project name/.test(m)) n-=100;
        if (el.tagName==="TEXTAREA") n+=35;
        if (el.isContentEditable || el.getAttribute("contenteditable")==="true") n+=40;
        if (el.getAttribute("role")==="textbox") n+=25;
        if (el.closest("main")) n+=10;
        const v=el.value||el.textContent||""; if (v.length>1000) n-=20;
        return n;
      };
      return score(b)-score(a);
    });
    return list[0] && (()=>{const el=list[0];const m=meta(el);return /prompt|describe|create|video|image|generate|write/.test(m)||el.tagName==="TEXTAREA"||el.isContentEditable||el.getAttribute("role")==="textbox";})() ? list[0] : null;
  }
  function findProjectLink() {
    const links=deepAll('a[href], button, [role="button"], div, span').filter(visible);
    return links.find(el=>{
      const t=(el.innerText||el.textContent||"").trim();
      return /^new project$/i.test(t) && t.length<40;
    });
  }
  async function openProject() {
    if (findPrompt()) return;
    const target=findProjectLink();
    if (!target) return;
    const a=target.closest("a[href]") || (target.matches("a[href]")?target:null);
    const href=a?.href || target.getAttribute("href") || "";
    if (href && /\/project\//i.test(href)) { location.href=href; return; }
    target.click();
  }
  async function waitPrompt() {
    let p=findPrompt(); if(p) return p;
    await openProject();
    const start=Date.now();
    while(Date.now()-start<25000){ p=findPrompt(); if(p) return p; await sleep(350); }
    return null;
  }
  function fill(el,text) {
    el.focus();
    if(el.isContentEditable || el.getAttribute("contenteditable")==="true"){
      try { document.execCommand("selectAll",false,null); document.execCommand("insertText",false,text); } catch {}
      if((el.innerText||el.textContent||"").trim()!==text){ el.replaceChildren(document.createTextNode(text)); }
      el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:text}));
      el.dispatchEvent(new Event("change",{bubbles:true}));
    } else {
      const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
      setter?setter.call(el,text):el.value=text;
      el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:text}));
      el.dispatchEvent(new Event("change",{bubbles:true}));
    }
  }
  function toFile(r){const raw=atob(r.base64||"");const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new File([bytes],r.name||"reference",{type:r.mimeType||"image/png"});}
  async function upload(refs){
    if(!refs?.length) return 0;
    const inputs=deepAll('input[type="file"]').filter(i=>{const a=(i.accept||"").toLowerCase();return !a||/image|video|media/.test(a);});
    const input=inputs.find(i=>i.multiple)||inputs[0];
    if(!input) throw new Error("Prompt was filled, but Flow's file-upload control is not available yet.");
    const dt=new DataTransfer(); refs.forEach(r=>dt.items.add(toFile(r))); input.files=dt.files;
    input.dispatchEvent(new Event("input",{bubbles:true})); input.dispatchEvent(new Event("change",{bubbles:true})); await sleep(2000); return refs.length;
  }
  async function handle(payload){
    if(!location.hostname.includes("flow.google") && !(location.hostname.endsWith("labs.google")&&location.pathname.includes("flow"))) return {ok:false,message:"Flow tab is not on the supported page."};
    const prompt=await waitPrompt();
    if(!prompt) return {ok:false,retry:true,message:"Flow project editor is not ready yet. Open New project, then resend."};
    const text=String(payload.prompt||"").trim(); if(!text) return {ok:false,message:"The prompt text was empty."};
    fill(prompt,text); await sleep(800);
    const actual=(prompt.isContentEditable?prompt.innerText:prompt.value||prompt.textContent||"").trim();
    if(!actual) return {ok:false,message:"Flow editor rejected the text. Click its prompt field and resend."};
    let attached=0, warning="";
    try{attached=await upload(payload.references||[]);}catch(e){warning=" "+(e.message||"Reference files could not be attached; attach them manually.");}
    return {ok:true,message:"Prompt inserted"+(attached?"; attached "+attached+" reference(s)": "")+"."+warning+" Generate was NOT clicked."};
  }
  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{if(msg?.type!==MESSAGE)return;handle(msg.payload||{}).then(sendResponse).catch(e=>sendResponse({ok:false,message:e.message||"Flow handoff failed."}));return true;});
})();