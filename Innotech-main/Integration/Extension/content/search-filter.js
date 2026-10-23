(() => {
  "use strict";
  const STYLE = "fl-search-style", BADGE = "fl-relevance-badge", HIDDEN = "fl-hidden-result";
  const defaults = { enabled: true, hideBelowCutoff: false, cutoff: 35 };
  let settings = { ...defaults }, timer, observer, reveal = false;
  const providers = {
    google: { param:"q", roots:["#search .MjjYud","#search .g","#rso > div","div.MjjYud"], title:["h3"], snippet:[".VwiC3b",".IsZvec",".aCOpRe",".lyLwlc"] },
    bing: { param:"q", roots:["#b_results > li.b_algo","#b_results .b_algo"], title:["h2"], snippet:[".b_caption p",".b_algoSlug","p"] },
    duck: { param:"q", roots:["[data-testid='result']",".result"], title:["[data-testid='result-title-a']","h2 a",".result__title"], snippet:["[data-result='snippet']","[data-testid='result-snippet']",".result__snippet"] },
    brave: { param:"q", roots:[".snippet","[data-type='web']"], title:[".snippet-title","a.heading-serpresult","h2"], snippet:[".snippet-description",".snippet-description p"] },
    yahoo: { param:"p", roots:["#web ol.searchCenterMiddle > li","#web .algo"], title:["h3","h2"], snippet:[".compText",".fz-ms"] },
    ecosia: { param:"q", roots:["[data-test-id='mainline-result-web']",".result"], title:["h2 a","a.result-title","h2"], snippet:[".result-snippet","p"] },
    youtube: { param:"search_query", roots:["ytd-video-renderer","ytd-reel-item-renderer"], title:["a#video-title","h3 a"], snippet:["yt-formatted-string.metadata-snippet-text","yt-formatted-string#description-text","div#description-text"], channel:["ytd-channel-name"] }
  };
  function provider() {
    const h=location.hostname.toLowerCase();
    if(h.includes("google.")) return providers.google;
    if(h==="www.bing.com"||h.endsWith(".bing.com")) return providers.bing;
    if(h.includes("duckduckgo.com")) return providers.duck;
    if(h==="search.brave.com") return providers.brave;
    if(h==="search.yahoo.com") return providers.yahoo;
    if(h.includes("ecosia.org")) return providers.ecosia;
    if(h === "www.youtube.com" && location.pathname === "/results") return providers.youtube;
    return null;
  }
  const first=(el, sels)=>{for(const s of sels){const n=el.querySelector(s);if(n)return n;}return null;};
  const norm=s=>(s||"").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
  const stop=new Set("a an the and or but for nor on at to from by with about is are was were be been being in of it this that how what why when where who which can could should would do does did".split(" "));
  const terms=s=>[...new Set(norm(s).split(" ").filter(w=>w.length>1&&!stop.has(w)))];
  function score(q,title,snippet,url){
    const ts=terms(q); if(!ts.length)return {score:100,matched:0,total:0};
    const t=norm(title),s=norm(snippet),u=norm((url||"").replace(/^https?:\/\//,"").replace(/[/?=&._-]/g," "));
    let points=0,matched=0;
    for(const w of ts){let p=0;if(t.includes(w))p+=3;if(s.includes(w))p+=1.4;if(u.includes(w))p+=.6;points+=Math.min(p,3);if(p)matched++;}
    let n=Math.round(points/(ts.length*3)*100);
    const phrase=norm(q);
    if(phrase.length>4&&t.includes(phrase))n+=8;
    else if(phrase.length>4&&s.includes(phrase))n+=5;
    return {score:Math.min(99,Math.max(0,n)),matched,total:ts.length};
  }
  function styles(){
    if(document.getElementById(STYLE))return;
    const st=document.createElement("style");st.id=STYLE;
    st.textContent=`.${HIDDEN}{display:none!important}#frictionlayer-search-banner{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:12px 0;padding:12px 14px;border:1px solid #2dd4bf66;border-radius:10px;background:#0b1724;color:#e2e8f0;font:13px/1.5 system-ui,sans-serif}#frictionlayer-search-banner strong{color:#5eead4}#frictionlayer-search-banner button{border:1px solid #2dd4bf66;border-radius:7px;padding:6px 10px;background:#122b3a;color:#99f6e4;cursor:pointer;font-weight:600}`;
    (document.head||document.documentElement).appendChild(st);
  }
  // Badge lives in a Shadow DOM so page CSS cannot restyle it. All visuals sit on an inner
  // .pill element: outer inline styles on the host (e.g. all:initial) would otherwise beat
  // :host rules and strip the background/border/padding.
  const BADGE_CSS=":host{display:inline-block;vertical-align:middle;margin:5px 6px 4px 0;direction:ltr;unicode-bidi:isolate;writing-mode:horizontal-tb;text-orientation:mixed;transform:none;rotate:none;scale:none;translate:none;filter:none;opacity:1}.pill{all:initial;box-sizing:border-box;display:inline-flex;flex-direction:row;align-items:center;gap:5px;padding:4px 8px;border:1px solid #2dd4bf66;border-radius:6px;background:#0f2330;color:#a7f3e8;font:600 11px/1.3 system-ui,sans-serif;letter-spacing:normal;text-transform:none;text-align:left;direction:ltr;unicode-bidi:isolate;writing-mode:horizontal-tb;text-orientation:mixed;transform:none;rotate:none;scale:none;translate:none;white-space:normal}.dot{width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:#2dd4bf}.text{color:#a7f3e8}";
  function makeBadge(res){
    const badge=document.createElement("span");
    badge.className=BADGE;
    badge.style.cssText="display:inline-block!important;vertical-align:middle!important;margin:5px 6px 4px 0!important;direction:ltr!important;unicode-bidi:isolate!important;writing-mode:horizontal-tb!important;transform:none!important;rotate:none!important;scale:none!important;translate:none!important;filter:none!important;opacity:1!important;position:relative!important;z-index:2!important;";
    const shadow=badge.attachShadow({mode:"open"});
    const st=document.createElement("style");st.textContent=BADGE_CSS;
    const pill=document.createElement("span");pill.className="pill";
    const dot=document.createElement("span");dot.className="dot";dot.setAttribute("aria-hidden","true");
    const label=document.createElement("span");label.className="text";label.textContent=`Estimated relevance: ${res.score}%`;
    pill.append(dot,label);shadow.append(st,pill);
    badge.title=`Matched ${res.matched} of ${res.total} query terms. Heuristic relevance estimate, not verified factual accuracy.`;
    return badge;
  }
  // If an ancestor is flipped/rotated by the page (mirror or ~180deg), counter-rotate the badge so it reads upright.
  function guardOrientation(badge){
    try{
      let m=new DOMMatrix();
      for(let el=badge.parentElement;el&&el!==document.documentElement;el=el.parentElement){
        const t=getComputedStyle(el).transform;
        if(t&&t!=="none")m=new DOMMatrix(t).multiply(m);
      }
      const flipped=(m.a*m.d-m.b*m.c)<0, upsideDown=m.d<-0.0001;
      if(flipped||upsideDown){
        const inv=m.inverse();
        badge.style.setProperty("transform",`matrix(${inv.a},${inv.b},${inv.c},${inv.d},0,0)`,"important");
        badge.style.setProperty("transform-origin","center","important");
      }
    }catch{}
  }
  function results(cfg){const set=new Set();for(const sel of cfg.roots){try{document.querySelectorAll(sel).forEach(e=>set.add(e));}catch{}}return [...set].filter(e=>!e.closest("#frictionlayer-search-banner"));}
  function restore(){
    document.querySelectorAll("[data-fl-scored]").forEach(el=>{el.classList.remove(HIDDEN);el.removeAttribute("data-fl-scored");el.removeAttribute("data-fl-score");el.querySelectorAll("."+BADGE).forEach(b=>b.remove());});
    document.querySelectorAll("[data-fl-old-display]").forEach(el=>{el.style.display=el.getAttribute("data-fl-old-display")||"";el.removeAttribute("data-fl-old-display");});
    reveal=false;
  }
  function banner(scored,hidden,cfg){
    let b=document.getElementById("frictionlayer-search-banner");
    const root=document.querySelector("#search, #b_results, #web, [data-testid='mainline']");
    if(!root)return;
    if(!b){b=document.createElement("div");b.id="frictionlayer-search-banner";root.insertBefore(b,root.firstChild);}
    b.innerHTML=`<span><strong>FrictionLayer</strong> · ${settings.hideBelowCutoff&&!reveal?`Hiding below ${settings.cutoff}%`:"Scores only"} · ${scored} results scored · ${hidden} hidden</span><button type="button">Restore hidden results</button>`;
    b.querySelector("button").addEventListener("click",()=>{reveal=true;document.querySelectorAll("."+HIDDEN).forEach(e=>e.classList.remove(HIDDEN));banner(scored,0,cfg);});
  }
  function process(){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const cfg=provider();if(!cfg||!settings.enabled){restore();document.getElementById("frictionlayer-search-banner")?.remove();return;}
      const q=(new URLSearchParams(location.search).get(cfg.param)||"").trim();
      if(!q){restore();document.getElementById("frictionlayer-search-banner")?.remove();return;}
      styles();let count=0,hidden=0;
      const doneEls=[];
      for(const el of results(cfg).reverse()){
        if(doneEls.some(d=>el!==d&&el.contains(d)))continue;
        const titleEl=first(el,cfg.title);if(!titleEl)continue;
        const title=titleEl.textContent.trim(),link=titleEl.closest("a")||titleEl.querySelector("a")||el.querySelector("a[href]");
        if(!title||!link||!/^https?:/i.test(link.href))continue;
        const sn=first(el,cfg.snippet),snippet=sn?.textContent.trim()||"";
        el.classList.remove(HIDDEN);el.querySelectorAll("."+BADGE).forEach(b=>b.remove());
        const res=score(q,title,snippet,link.href);
        const badge=makeBadge(res);
        (titleEl.closest("a")||titleEl).insertAdjacentElement("afterend",badge);guardOrientation(badge);
        doneEls.push(el);el.setAttribute("data-fl-scored","1");el.setAttribute("data-fl-score",String(res.score));count++;
        if(settings.hideBelowCutoff&&!reveal&&res.score<settings.cutoff){el.classList.add(HIDDEN);hidden++;}
      }
      banner(count,hidden,cfg);
    },180);
  }
  function load(){chrome.storage.local.get("frictionLayerSearchSettings",d=>{settings={...defaults,...(d.frictionLayerSearchSettings||{})};process();});}
  chrome.runtime.onMessage.addListener((m,_s,send)=>{if(m?.type==="FL_SEARCH_SETTINGS_UPDATED"){settings={...settings,...m.settings};process();send({ok:true});}else if(m?.type==="FL_SEARCH_REPROCESS"){process();send({ok:true});}return true;});
  function init(){
    styles();load();
    const routeChanged=()=>{
      // YouTube is a single-page app: wait for the new route's query and result cards.
      process();
      setTimeout(process,250);
      setTimeout(process,700);
    };
    observer=new MutationObserver(ms=>{const external=ms.some(m=>{if(m.target instanceof Element&&(m.target.closest("#frictionlayer-search-banner")||m.target.closest("."+BADGE)))return false;const nodes=[...m.addedNodes,...m.removedNodes];if(nodes.length&&nodes.every(n=>n.nodeType===1&&(n.matches?.("."+BADGE)||n.id==="frictionlayer-search-banner"||n.closest?.("#frictionlayer-search-banner")||n.closest?.("."+BADGE))))return false;return true;});if(external)process();});
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener("yt-navigate-finish",routeChanged);
    document.addEventListener("yt-page-data-updated",routeChanged);
    window.addEventListener("popstate",routeChanged);
    document.addEventListener("submit",event=>{if(event.target?.querySelector?.("input[name='search_query']"))routeChanged();},true);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();