(() => {
  if (window.__rephraseLoaded) return;
  window.__rephraseLoaded = true;
  const host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;top:0!important;left:0!important';
  const root = host.attachShadow({mode:'closed'});
  const style = document.createElement('style');
  style.textContent = `
  :host{color-scheme:dark}*{box-sizing:border-box}button{font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:default}
  .panel{position:fixed;width:360px;max-width:calc(100vw - 24px);max-height:min(720px,calc(100dvh - 24px));display:flex;flex-direction:column;background:#202024;color:#f5f2ff;border:1px solid #414047;border-radius:18px;box-shadow:0 16px 60px #0005,0 0 0 1px #0002;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:auto;overscroll-behavior:contain;animation:enter .2s ease-out}.head,.intro,.tones,.actions,.foot{flex-shrink:0}
  .head{padding:16px 18px 12px;display:flex;align-items:center;gap:9px}.logo{background:#bba0ff;color:#251345;width:27px;height:27px;display:grid;place-items:center;border-radius:9px;font-size:19px}.brand{font-size:15px;font-weight:650;letter-spacing:-.5px}.label{margin-left:auto;color:#9e99aa;font-size:10px;letter-spacing:1.2px}.close{border:0;background:none;color:#aaa5b7;font-size:20px;padding:0 3px}
  .intro{margin:0;padding:0 18px 13px;color:#a9a5b4;font-size:12px}.tones{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:0 14px 14px}.tone{display:flex;align-items:center;gap:10px;text-align:left;background:#2b2a30;border:1px solid #3b3844;border-radius:10px;padding:10px;color:#f3eefc;transition:background .15s,transform .15s}.tone:hover,.tone.active{background:#3b2e55;border-color:#a984ee;transform:translateY(-1px)}.tone span:first-child{font-size:18px;color:#c5a7ff}.tone small{display:block;font-size:10px;color:#a8a1b5;font-weight:400}.tone strong{font-size:12px;font-weight:550}button:focus-visible{outline:2px solid #c5a7ff;outline-offset:2px}
  .result{margin:0 14px 14px;padding:14px;background:#18171c;border:1px solid #39323f;border-radius:11px;flex:0 1 auto;min-height:70px;overflow:auto;overscroll-behavior:contain;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;font-size:13px}.result.error{color:#f4b8c3}.result.loading{color:#c2a6f4;animation:pulse 1s ease-in-out infinite alternate}.actions{display:flex;gap:8px;padding:0 14px 14px}.actions button{border:1px solid #45404e;border-radius:9px;background:#302d36;color:#ded7eb;padding:9px 15px;font-size:12px}.actions .primary{background:#b89af6;color:#201333;border-color:#b89af6;font-weight:650;flex:1}.foot{border-top:1px solid #35323b;padding:10px 16px;display:flex;justify-content:space-between;gap:8px;color:#8e879c;font-size:10px}.foot button{border:0;background:none;color:#c5a7ff;font-size:10px;padding:0}.hidden{display:none}@keyframes enter{from{opacity:0;transform:translateY(5px) scale(.98)}to{opacity:1;transform:none}}@keyframes pulse{to{opacity:.5}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
  root.append(style);
  const panel = document.createElement('section');
  panel.className='panel'; panel.setAttribute('aria-label','Rephrase text');
  panel.innerHTML=`<div class="head"><span class="logo">✦</span><span class="brand">rephrase</span><span class="label">A BETTER WAY TO SAY IT</span><button class="close" aria-label="Close">×</button></div><p class="intro">Same you. Just the right words.</p><div class="tones">${[['friendly','☀','Friendly','A little more human'],['professional','◇','Professional','Polished & confident'],['humorous','⌁','Humorous','Add a little personality'],['concise','→','Short & sweet','Less, but better']].map(([id,icon,name,sub])=>`<button class="tone" data-tone="${id}"><span>${icon}</span><span><strong>${name}</strong><small>${sub}</small></span></button>`).join('')}</div><div class="result hidden" role="status" aria-live="polite"></div><div class="actions hidden"><button class="primary" id="replace">Replace selection</button><button id="copy">Copy</button></div><div class="foot"><span>Local Ollama · runs only when you choose a tone</span><button id="settings">Settings →</button></div>`;
  root.append(panel);
  const result=root.querySelector('.result'), actions=root.querySelector('.actions');
  let current, output='', requestId=0, positionFrame=0, pointerOrigin=null;
  function close(){host.remove(); current=null; requestId++;}
  root.querySelector('.close').onclick=close;
  root.querySelector('#settings').onclick=()=>chrome.runtime.sendMessage({type:'settings'});
  function position(){
    if(!current || !host.isConnected)return;
    // Ranges track text as the document or an email composer's own scroll area moves.
    const rect=current.range?.getBoundingClientRect() || current.target.getBoundingClientRect();
    const size=Math.max(current.text.length, output.length);
    const width=Math.min(Math.max(360,320+Math.sqrt(size)*9),640,innerWidth-24);
    panel.style.width=Math.max(0,width)+'px';
    panel.style.left=Math.max(12,Math.min(rect.left,innerWidth-width-12))+'px';
    const h=panel.getBoundingClientRect().height;
    // Prefer below the selection, then above if it fits. Keep actions in reach at viewport edges.
    let top=rect.bottom+10;
    if(top+h>innerHeight-12 && rect.top-h-10>=12)top=rect.top-h-10;
    panel.style.top=Math.max(12,Math.min(top,innerHeight-h-12))+'px';
  }
  function schedulePosition(){
    if(positionFrame || !current)return;
    positionFrame=requestAnimationFrame(()=>{positionFrame=0;position();});
  }
  function editorFor(node){
    let element=node.nodeType===1?node:node.parentElement;
    if(!element?.isContentEditable || element.closest('[aria-readonly="true"],[aria-disabled="true"],[inert]'))return null;
    while(element.parentElement?.isContentEditable)element=element.parentElement;
    return element;
  }
  function isTextField(element){
    return element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && ['text','search','url','tel'].includes(element.type));
  }
  function writableField(element){
    return isTextField(element) && element.isConnected && !element.readOnly && !element.matches(':disabled') && !element.closest('[aria-readonly="true"],[aria-disabled="true"],[inert]');
  }
  function writableRange(range,editor){
    if(!editor?.isConnected || editorFor(range.startContainer)!==editor || editorFor(range.endContainer)!==editor)return false;
    // Do not include quoted or locked sections embedded inside an otherwise editable composer.
    return !Array.from(editor.querySelectorAll('[contenteditable="false"],[aria-readonly="true"],[aria-disabled="true"],[inert]')).some(node=>range.intersectsNode(node));
  }
  function currentIsWritable(){
    return !!current && (current.range?writableRange(current.range,current.target):writableField(current.target));
  }
  function capture(source){
    let active=document.activeElement;
    while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;
    if((source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement) && (source!==active || !writableField(source)))return close();
    let text, range, start, end, target;
    // Use the event's source too: an old selection in a focused field must not reopen
    // the panel when the user is selecting ordinary page text elsewhere.
    if(isTextField(active) && source===active){
      if(!writableField(active))return close();
      start=active.selectionStart;end=active.selectionEnd;text=active.value.slice(start,end);target=active;
    }else{
      const selection=getSelection();
      if(!selection?.rangeCount || selection.isCollapsed)return close();
      range=selection.getRangeAt(0).cloneRange();target=editorFor(range.startContainer);
      if(!writableRange(range,target))return close();
      if(source!==target && !target.contains(source))return close();
      text=selection.toString();
    }
    if(!text?.trim())return close();
    // Selection.toString() includes rendered paragraph breaks; Range.toString() does not.
    // Keep the raw range snapshot separately for detecting edits without rejecting email paragraphs.
    current={text,range,rangeText:range?.toString(),start,end,target}; output='';requestId++;
    result.className='result hidden';actions.className='actions hidden';root.querySelectorAll('.tone').forEach(b=>b.classList.remove('active'));
    document.documentElement.append(host);position();
  }
  function isScrollbar(event){
    if(event.clientX>=document.documentElement.clientWidth || event.clientY>=document.documentElement.clientHeight)return true;
    const target=event.target;
    if(!(target instanceof HTMLElement))return false;
    const box=target.getBoundingClientRect();
    return (target.offsetWidth>target.clientWidth && event.clientX>=box.left+target.clientLeft+target.clientWidth) || (target.offsetHeight>target.clientHeight && event.clientY>=box.top+target.clientTop+target.clientHeight);
  }
  document.addEventListener('mouseup',e=>{
    // A selection drag may begin in a field and end just beyond its border.
    const source=pointerOrigin && (isTextField(pointerOrigin) || editorFor(pointerOrigin))?pointerOrigin:e.composedPath()[0];pointerOrigin=null;
    if(!e.composedPath().includes(host) && !isScrollbar(e))setTimeout(()=>capture(source),10);
  });
  document.addEventListener('keyup',e=>{if(e.key==='Escape')close();else if((e.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='a'))capture(e.composedPath()[0]);});
  document.addEventListener('touchend',e=>{if(!e.composedPath().includes(host)){const source=e.composedPath()[0];setTimeout(()=>capture(source),10);}});
  document.addEventListener('mousedown',e=>{
    if(e.composedPath().includes(host))return;
    pointerOrigin=e.composedPath()[0];
    // Native scrollbars must be usable without dismissing the panel.
    if(isScrollbar(e))return;
    close();
  },true);
  window.addEventListener('scroll',schedulePosition,true);
  window.addEventListener('resize',schedulePosition);
  const resizeObserver=new ResizeObserver(schedulePosition);
  resizeObserver.observe(panel);
  // Preserve the editor selection on buttons while allowing result selection and scrollbar use.
  root.addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault();});
  root.querySelectorAll('.tone').forEach(button=>button.onclick=async()=>{
    if(!currentIsWritable())return close();const id=++requestId;
    root.querySelectorAll('.tone').forEach(b=>b.classList.toggle('active',b===button));
    result.className='result loading';result.textContent='Finding your better words locally… First use may take a moment.';actions.className='actions hidden';position();
    try{const response=await chrome.runtime.sendMessage({type:'rewrite',text:current.text,tone:button.dataset.tone});if(id!==requestId)return;if(!currentIsWritable())return close();if(response.error)throw new Error(response.error);output=response.text;result.className='result';result.textContent=output;actions.className='actions';}
    catch(e){if(id!==requestId)return;result.className='result error';result.textContent=e.message || 'Reload this page to reconnect to Rephrase.';}
    position();
  });
  root.querySelector('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(output);root.querySelector('#copy').textContent='Copied ✓';setTimeout(()=>root.querySelector('#copy').textContent='Copy',1500);}catch{result.textContent='Clipboard unavailable. Select the rewrite and copy it manually.';}};
  root.querySelector('#replace').onclick=()=>{
    if(!currentIsWritable())return close();if(!output)return;const {target,range,rangeText,text,start,end}=current;
    if(!target.isConnected){result.textContent='The editor changed. Select your text again.';return;}
    target.focus();
    if(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement){
      if(target.value.slice(start,end)!==text){result.textContent='Your text changed. Select it again to avoid replacing the wrong words.';return;}
      target.setSelectionRange(start,end);
      if(!document.execCommand('insertText',false,output)){const value=target.value.slice(0,start)+output+target.value.slice(end);const proto=target instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(target,value);target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:output}));}
    }else{
      if(!target.contains(range.startContainer) || !target.contains(range.endContainer) || range.toString()!==rangeText){result.textContent='Your text changed. Select it again.';return;}
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      if(!document.execCommand('insertText',false,output)){result.textContent='This editor does not support replacement. Use Copy instead.';return;}
    }
    close();
  };
})();
