// Cinemotion Studio Google Flow connector — project-aware handoff.
(() => {
  const MESSAGE = "CINEMOTION_FLOW_FILL";
  if (window.__cinemotionFlowBridgeV3) return;
  window.__cinemotionFlowBridgeV3 = true;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => {
    if (!el || el.disabled || el.hidden) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity || 1) > 0 && el.getClientRects().length > 0;
  };
  function deepAll(selector) {
    const out=[];
    const walk=root=>{
      try{out.push(...root.querySelectorAll(selector));}catch{}
      let nodes=[];try{nodes=root.querySelectorAll("*");}catch{}
      for(const n of nodes)if(n.shadowRoot)walk(n.shadowRoot);
    };
    walk(document);return [...new Set(out)];
  }
  const meta=el=>[el.getAttribute("placeholder"),el.getAttribute("aria-label"),el.getAttribute("data-placeholder"),el.getAttribute("name"),el.getAttribute("title")].join(" ").toLowerCase();
  function isProjectPage(){return /\/project\//i.test(location.pathname)||/project/i.test(document.title);}
  function findPrompt(){
    // Do not mistake the Flow home-page search box for the generation prompt.
    if(!isProjectPage()) return null;
    const selectors='textarea, [contenteditable="true"], [role="textbox"], input:not([type="hidden"]):not([type="file"])';
    const candidates=deepAll(selectors).filter(visible).filter(el=>!el.readOnly&&!el.disabled);
    const scored=candidates.map(el=>{
      const m=meta(el);let score=0;
      if(/prompt|describe|create|video|image|generate|write/.test(m))score+=120;
      if(/search|email|password|login|comment|filter|project name/.test(m))score-=120;
      if(el.tagName==="TEXTAREA")score+=45;
      if(el.isContentEditable||el.getAttribute("contenteditable")==="true")score+=50;
      if(el.getAttribute("role")==="textbox")score+=25;
      if(el.closest("main"))score+=10;
      return {el,score};
    }).sort((a,b)=>b.score-a.score);
    const top=scored[0];
    if(!top||top.score<20)return null;
    return top.el;
  }
  function findNewProject(){
    const clickable=deepAll('button, [role="button"], a[href], [tabindex="0"]').filter(visible);
    const match=clickable.find(el=>{
      const text=(el.innerText||el.textContent||"").trim().replace(/\s+/g," ");
      return /^new project$/i.test(text)||/^\+\s*new project$/i.test(text);
    });
    if(match)return match;
    // Fallback: find the text and promote it to its nearest clickable card.
    const textNodes=deepAll("div,span").filter(visible).filter(el=>/^new project$/i.test((el.innerText||el.textContent||"").trim()));
    return textNodes[0]?.closest('button,[role="button"],a[href],[tabindex="0"]')||textNodes[0]||null;
  }
  async function openProject(){
    if(findPrompt()||isProjectPage())return;
    const target=findNewProject();
    if(!target){return;}
    const link=target.closest("a[href]")||(target.matches?.("a[href]")?target:null);
    const href=link?.href||target.getAttribute?.("href")||"";
    if(href&&/\/project\//i.test(href)){location.href=href;return;}
    target.scrollIntoView?.({block:"center"});
    target.click();
  }
  async function waitPrompt(){
    let p=findPrompt();if(p)return p;
    if(!isProjectPage())await openProject();
    const start=Date.now();
    while(Date.now()-start<18000){
      p=findPrompt();if(p)return p;
      await sleep(300);
    }
    return null;
  }
  function fill(el,text){
    el.focus();
    if(el.isContentEditable||el.getAttribute("contenteditable")==="true"){
      try{document.execCommand("selectAll",false,null);document.execCommand("insertText",false,text);}catch{}
      if((el.innerText||el.textContent||"").trim()!==text)el.replaceChildren(document.createTextNode(text));
      el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:text}));
      el.dispatchEvent(new Event("change",{bubbles:true}));
    }else{
      const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
      setter?setter.call(el,text):el.value=text;
      el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:text}));
      el.dispatchEvent(new Event("change",{bubbles:true}));
    }
  }
  function toFile(r){const raw=atob(r.base64||"");const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new File([bytes],r.name||"reference",{type:r.mimeType||"image/png"});}
  async function upload(refs){
    if(!refs?.length)return 0;
    const inputs=deepAll('input[type="file"]').filter(i=>{const a=(i.accept||"").toLowerCase();return !a||/image|video|media/.test(a);});
    const input=inputs.find(i=>i.multiple)||inputs[0];
    if(!input)throw new Error("Prompt inserted, but Flow upload control wasn't detected. Attach reference media manually.");
    const dt=new DataTransfer();refs.forEach(r=>dt.items.add(toFile(r)));input.files=dt.files;
    input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));
    await sleep(1800);return refs.length;
  }
  async function handle(payload){
    if(!(location.hostname==="flow.google"||location.hostname.endsWith(".flow.google")||(location.hostname.endsWith("labs.google")&&location.pathname.includes("flow"))))
      return {ok:false,message:"The active tab is not Google Flow."};
    const text=String(payload.prompt||"").trim();if(!text)return {ok:false,message:"Prompt text was empty."};
    const prompt=await waitPrompt();
    if(!prompt)return {ok:false,retry:true,message:"Flow home opened. Click New project if it hasn't opened, then click Resend to Flow."};
    fill(prompt,text);await sleep(700);
    const actual=(prompt.isContentEditable?prompt.innerText:prompt.value||prompt.textContent||"").trim();
    if(!actual.includes(text.slice(0,Math.min(30,text.length))))return {ok:false,message:"Flow did not accept the prompt text. Click the prompt field and resend."};
    let attached=0,warning="";
    try{attached=await upload(payload.references||[]);}catch(e){warning=" "+(e.message||"References need manual attachment.");}
    return {ok:true,message:"Prompt inserted"+(attached?"; attached "+attached+" reference(s)":"")+". "+warning+" Generate was NOT clicked."};
  }
  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg?.type!==MESSAGE)return;
    handle(msg.payload||{}).then(sendResponse).catch(e=>sendResponse({ok:false,message:e.message||"Flow handoff failed."}));
    return true;
  });
})();