javascript:(function(){
/*** =============== Utils =============== ***/
function toISO(s){try{const d=new Date((s||'').trim());if(!isNaN(d))return d.toISOString().slice(0,10);return (s||'').trim()}catch{return (s||'').trim()}}
function pickEmail(t){const m=(t||'').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);return m?m[0].toLowerCase():''}
function $(sel){return document.querySelector(sel)}
function getTable(){return $('table')}
function getTbody(){const t=getTable();return t?t.querySelector('tbody'):null}
function getRows(){const tb=getTbody();return tb?[...tb.querySelectorAll('tr')]:[]}
function btnDisabled(btn){return !btn || btn.disabled || btn.getAttribute('aria-disabled')==='true'}
function clickButton(btn){
  try{
    btn.scrollIntoView({block:'center'});
    btn.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    btn.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    btn.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
    btn.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    btn.click();
    return true;
  }catch(e){ try{btn.click();return true;}catch(_){return false;} }
}

/*** =============== Pagination Buttons =============== ***/
var XPATH_PREV='/html/body/div[1]/div/div/div[2]/main/div[3]/main/div/div/div/div[3]/div/div/button[1]';
var XPATH_NEXT='/html/body/div[1]/div/div/div[2]/main/div[3]/main/div/div/div/div[3]/div/div/button[2]';
function byXPath(xp){
  try{return document.evaluate(xp,document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue||null;}catch(e){return null}
}
function getPrevBtn(){ 
  let n=byXPath(XPATH_PREV);
  if(n && n.tagName && n.tagName.toLowerCase()==='button') return n;
  if(n){ const b=n.closest('button'); if(b) return b; }
  let cands=[...document.querySelectorAll('button[aria-label*="Previous" i],button[aria-label*="prev" i]')];
  if(cands.length) return cands[0];
  return null;
}
function getNextBtn(){
  let n=byXPath(XPATH_NEXT);
  if(n && n.tagName && n.tagName.toLowerCase()==='button') return n;
  if(n){ const b=n.closest('button'); if(b) return b; }
  let cands=[...document.querySelectorAll('button[aria-label*="Next" i],button[aria-label*="next" i]')];
  if(!cands.length){ cands=[...document.querySelectorAll('button')].filter(b=>/›|»|→|next/i.test((b.innerText||'')+(b.getAttribute('aria-label')||''))); }
  const ok=cands.find(b=>!btnDisabled(b));
  return ok||cands[0]||null;
}

function waitRowsStable(cb, maxMs){
  maxMs = maxMs || 8000;
  const start=Date.now();
  let lastCount=-1, lastHTML='', stableTicks=0;
  (function tick(){
    const tb=getTbody();
    if(!tb){ if(Date.now()-start>maxMs) return cb(true); return setTimeout(tick,150); }
    const rows=getRows();
    const cnt=rows.length;
    const html=tb.innerHTML;
    if(cnt===lastCount && html===lastHTML){ stableTicks++; } else { stableTicks=0; }
    lastCount=cnt; lastHTML=html;
    if(cnt>0 && stableTicks>=3) return cb(true); 
    if(Date.now()-start>maxMs) return cb(true);
    setTimeout(tick,150);
  })();
}

function waitTbodyChanged(prevHTML, cb, maxMs){
  maxMs = maxMs || 8000;
  const tb=getTbody();
  if(!tb) return cb(true);
  let done=false;
  const timer=setTimeout(function(){ if(done)return; done=true; obs&&obs.disconnect(); cb(true); }, maxMs);
  const obs=new MutationObserver(function(){
    if(tb.innerHTML!==prevHTML){ if(done)return; done=true; clearTimeout(timer); obs.disconnect(); cb(true); }
  });
  obs.observe(tb,{childList:true,subtree:true,characterData:true});
}

/*** =============== Parse =============== ***/
function parsePage(){
  const out=[];
  getRows().forEach(tr=>{
    const tds=[...tr.querySelectorAll('td')];
    let email='', added='';
    if(tds.length){
      email = pickEmail((tds[0]&&tds[0].innerText)||tr.innerText||'');
      added = ((tds[2]&&tds[2].innerText)||'').trim();
    }else{
      const all=tr.innerText||'';
      email=pickEmail(all);
      const hit=(all.split(/\n+/).find(s=>/added|加入|邀请|invited/i.test(s))||'').trim();
      if(hit) added=hit.replace(/.*?:/,'').trim();
    }
    if(email) out.push({email, added: toISO(added)});
  });
  return out;
}

/*** =============== Main Flow =============== ***/
try{
  if(!getTable()) return alert('cannot find user list, please make sure the user list is loaded');

  const seen=new Set(), all=[];
  function pushDedup(arr){ arr.forEach(r=>{ if(!seen.has(r.email)){ seen.add(r.email); all.push(r); } }); }

  function gotoFirst(cb){
    const prev=getPrevBtn();
    if(!prev || btnDisabled(prev)) return cb(); 
    const t0=Date.now();
    (function loopPrev(){
      const btn=getPrevBtn();
      if(!btn || btnDisabled(btn)) return cb();
      const tb=getTbody(); const prevHTML=tb?tb.innerHTML:'';
      clickButton(btn);
      waitTbodyChanged(prevHTML,function(){
        waitRowsStable(function(){
          if(Date.now()-t0>60000) return cb(); // 
          setTimeout(loopPrev,120);
        },4000);
      },8000);
    })();
  }

  function crawlForward(pageCount){
    pageCount = pageCount || 0;
    waitRowsStable(function(){
      const pageData=parsePage();
      pushDedup(pageData);

      const next=getNextBtn();
      if(!next || btnDisabled(next) || pageCount>1000){ 
        const esc=v=>('"'+String(v??'').replace(/"/g,'""')+'"');
        const csv=['email,added_on'].concat(all.map(r=>[r.email,r.added||''].map(esc).join(','))).join('\n');
        const blob=new Blob([csv],{type:'text/csv'});
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
        a.download='chatgpt_business_members_all_pages.csv';
        document.body.appendChild(a); a.click(); a.remove();
        alert('The export has been completed.：'+all.length+' unique emails');
        return;
      }

      const tb=getTbody(); const prevHTML=tb?tb.innerHTML:'';
      if(!clickButton(next)){
        alert('Can't click the next page button，you need to check the xpath attribute in the code');
        return;
      }
      waitTbodyChanged(prevHTML,function(){
        waitRowsStable(function(){ setTimeout(function(){ crawlForward(pageCount+1); },120); },4000);
      },8000);
    },6000);
  }

  gotoFirst(function(){ crawlForward(0); });

}catch(e){
  alert('error：'+(e&&e.message?e.message:e));
}
})();
