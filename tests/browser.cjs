// Chromium integration: real UI and editing, mocked Chrome messaging/Ollama.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const shortRewrite = 'Could you review this email?';
const origin = 'http://localhost:4173';
const fixture = `<!doctype html><html><head><style>
body{margin:0;font:16px/1.5 sans-serif;min-height:2600px}#plain,#editable{margin:180px 40px 0;width:600px}
textarea{display:block;margin:180px 40px 0;width:600px;height:110px}
#rich{margin:180px 40px 0;width:600px;min-height:90px;border:1px solid}
#scroller{margin:180px 40px 0;height:220px;width:650px;overflow:auto;border:1px solid}
#nested{margin:70px 20px 650px}iframe{margin:30px;width:900px;height:800px;border:1px solid}
</style></head><body><p id="plain">Please review this email.</p><p id="editable" contenteditable="true">Please review this email.</p><textarea id="draft">Before. Please review this email. After.</textarea>
<div id="rich" contenteditable="true"><p>Before. <strong id="rich-selection">Please review this email.</strong> After.</p></div>
<div id="scroller"><p id="nested" contenteditable="true">Please review this email.</p></div><script src="content.js"></script></body></html>`;

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route(`${origin}/**`, route => {
      const name = new URL(route.request().url()).pathname.slice(1) || 'options.html';
      if (name === 'fixture') return route.fulfill({body:fixture,contentType:'text/html'});
      const file = path.join(__dirname,'..',name);
      if (!fs.existsSync(file)) return route.fulfill({status:404,body:''});
      return route.fulfill({body:fs.readFileSync(file),contentType:name.endsWith('.png')?'image/png':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
    });
    await context.addInitScript(() => {
      // Expose the closed shadow root for tests only; production remains isolated.
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) { return attach.call(this,{...options,mode:'open'}); };
      const data = {apiKey:'legacy-key',ollamaUrl:'https://old.example:11434',ollamaModel:'llama3.2:3b'};
      window.__rewriteReply = {text:'Could you review this email?'};
      window.__ollamaReply = {models:['qwen2.5:3b'],modelAvailable:true};
      window.__requests = [];
      window.chrome = {
        storage:{local:{
          get:async keys => Object.fromEntries((typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys||data)).map(key=>[key,data[key]])),
          set:async values => Object.assign(data,values),
          remove:async keys => (typeof keys==='string'?[keys]:keys).forEach(key=>delete data[key])
        }},
        runtime:{
          id:'abcdefghijklmnopabcdefghijklmnop',
          sendMessage:async message => {
            window.__requests.push(message);
            if (message.type === 'ollama:test') return window.__ollamaReply;
            if (message.type === 'rewrite') return window.__rewriteReply;
            return {};
          },
          openOptionsPage:()=>{}
        }
      };
    });
    const panel = scope => scope.locator('.panel');
    const result = scope => scope.locator('.panel .result');
    const close = async scope => { if (await panel(scope).count()) await scope.getByRole('button',{name:'Close',exact:true}).click(); };
    async function selectText(scope,id) {
      await scope.evaluate(id => {
        const target = document.getElementById(id);
        target.scrollIntoView({block:'center'});
        target.focus();
        const range = document.createRange();
        range.selectNodeContents(target);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      },id);
      await panel(scope).waitFor();
    }
    async function rewrite(scope,tone='Friendly') {
      await scope.getByRole('button',{name:new RegExp(tone)}).click();
      await scope.getByRole('button',{name:'Copy',exact:true}).waitFor();
    }
    async function fresh() { await page.goto(`${origin}/fixture`); }
    async function selectDraft() {
      await page.locator('#draft').scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const draft = document.querySelector('#draft');
        draft.focus();draft.setSelectionRange(8,33);
        draft.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      });
      await panel(page).waitFor();
    }

    // Local app setup is automatic: no address/model entry or save step is required.
    await page.goto(`${origin}/options.html`);
    assert.equal(await page.locator('#endpoint,#model,#settings').count(),0);
    assert.equal(await page.getByRole('button',{name:/Save connection|Restore local defaults/}).count(),0);
    await page.waitForFunction(() => document.querySelector('.app-icon')?.naturalWidth === 48);
    assert.equal(await page.locator('#pull-command').textContent(),'ollama pull qwen2.5:3b');
    const originCommand = 'launchctl setenv OLLAMA_ORIGINS "chrome-extension://abcdefghijklmnopabcdefghijklmnop"';
    assert.equal(await page.locator('#ollama-origin-command').textContent(),originCommand);
    await page.waitForFunction(async () => {
      const data = await chrome.storage.local.get(['apiKey','ollamaUrl','ollamaModel']);
      return Object.values(data).every(value => value === undefined);
    });
    await page.locator('#copy-origin').click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),originCommand);
    await page.getByRole('button',{name:/Check local connection/}).click();
    await page.waitForFunction(() => /connected|ready/i.test(document.querySelector('#status').textContent));
    assert.deepEqual(await page.evaluate(()=>window.__requests.find(message=>message.type==='ollama:test')),{type:'ollama:test'});

    // A missing Qwen model and an unavailable app produce useful setup messages.
    await page.evaluate(() => window.__ollamaReply={models:[],modelAvailable:false});
    await page.locator('#test-connection').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('ollama pull qwen2.5:3b'));
    await page.evaluate(() => window.__ollamaReply={error:'Open the Ollama app, then try again.'});
    await page.locator('#test-connection').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Open the Ollama app'));

    // Ordinary webpage selections are left alone, including keyboard selection and
    // a stale field selection retained while a user highlights text elsewhere.
    await fresh();
    await page.evaluate(() => {
      const text = document.querySelector('#plain');
      const range = document.createRange();range.selectNodeContents(text);
      getSelection().removeAllRanges();getSelection().addRange(range);
      text.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    });
    await page.waitForTimeout(40);
    assert.equal(await panel(page).count(),0);
    await page.locator('#plain').dispatchEvent('keyup',{key:'ArrowRight',shiftKey:true});
    assert.equal(await panel(page).count(),0);
    await selectDraft();
    await page.evaluate(() => {
      // Leave the textarea focused and its selection offsets intact.
      const text=document.querySelector('#plain');
      const range=document.createRange();range.selectNodeContents(text);
      getSelection().removeAllRanges();getSelection().addRange(range);
      text.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    });
    await page.waitForTimeout(40);
    assert.equal(await panel(page).count(),0);
    assert.equal(await page.evaluate(()=>window.__requests.filter(m=>m.type==='rewrite').length),0);

    // Locked controls and read-only islands inside composers must not activate.
    for (const kind of ['readonly','disabled','fieldset','password','aria-readonly','contenteditable-false','mixed']) {
      await fresh();
      await page.evaluate(kind => {
        const rich=document.querySelector('#rich');
        const draft=document.querySelector('#draft');
        if(kind==='password'){const input=document.createElement('input');input.type='password';input.value='Do not rewrite passwords';document.body.append(input);input.focus();input.select();input.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));}
        else if (['readonly','disabled','fieldset'].includes(kind)) {
          draft.focus();draft.setSelectionRange(8,33);
          if(kind==='readonly')draft.readOnly=true;
          if(kind==='disabled')draft.disabled=true;
          if(kind==='fieldset'){const fieldset=document.createElement('fieldset');fieldset.disabled=true;draft.replaceWith(fieldset);fieldset.append(draft);}
          draft.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
        } else {
          if(kind==='aria-readonly')rich.setAttribute('aria-readonly','true');
          if(kind==='contenteditable-false')rich.querySelector('#rich-selection').contentEditable='false';
          const target=rich.querySelector('#rich-selection');
          const range=document.createRange();range.selectNodeContents(target);
          if(kind==='mixed')range.setStart(document.querySelector('#plain').firstChild,0);
          getSelection().removeAllRanges();getSelection().addRange(range);
          target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
        }
      },kind);
      await page.waitForTimeout(40);
      assert.equal(await panel(page).count(),0,`${kind} selection must not show Rephrase`);
    }

    // Dragging out beyond a textarea border still belongs to the field selection.
    await fresh();
    await page.evaluate(() => {
      const draft=document.querySelector('#draft');draft.focus();
      draft.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      draft.setSelectionRange(8,33);
      document.body.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    });
    await panel(page).waitFor();
    await close(page);

    // Rich editor drags can also end outside the box while the selected range
    // remains contained in the editable draft.
    await fresh();
    await page.evaluate(() => {
      const rich=document.querySelector('#rich');rich.focus();
      const text=document.querySelector('#rich-selection');
      text.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      const range=document.createRange();range.selectNodeContents(text);
      getSelection().removeAllRanges();getSelection().addRange(range);
      document.body.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    });
    await panel(page).waitFor();await rewrite(page);
    await page.getByRole('button',{name:'Replace selection'}).click();
    assert.equal((await page.locator('#rich').innerText()).replace(/\u00a0/g,' '),`Before. ${shortRewrite} After.`);

    // Keyboard selections in a writable plain input remain available for rewriting.
    await fresh();
    await page.evaluate(() => {
      const input=document.createElement('input');input.id='subject';input.value='Please review this email.';
      document.body.append(input);input.scrollIntoView();input.focus();input.select();
      input.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',shiftKey:true,bubbles:true}));
    });
    await panel(page).waitFor();await rewrite(page);
    await page.getByRole('button',{name:'Replace selection'}).click();
    assert.equal(await page.locator('#subject').inputValue(),shortRewrite);

    // Read-only changes after selection block both requests and replacement.
    await fresh();await selectDraft();
    await page.evaluate(()=>document.querySelector('#draft').readOnly=true);
    await page.getByRole('button',{name:/Friendly/}).click();
    assert.equal(await panel(page).count(),0);
    assert.equal(await page.evaluate(()=>window.__requests.filter(m=>m.type==='rewrite').length),0);
    await fresh();await selectDraft();await rewrite(page);
    const originalDraft=await page.locator('#draft').inputValue();
    await page.evaluate(()=>document.querySelector('#draft').readOnly=true);
    await page.getByRole('button',{name:'Replace selection'}).click();
    assert.equal(await panel(page).count(),0);
    assert.equal(await page.locator('#draft').inputValue(),originalDraft);

    // Page scroll keeps the same open panel and its rewrite, moving with the selection.
    await fresh();
    await selectText(page,'editable');
    await rewrite(page,'Professional');
    const before = await panel(page).boundingBox();
    await page.evaluate(() => window.scrollBy(0,70));
    await page.waitForFunction(y => [...document.querySelectorAll('div')].some(el=>el.shadowRoot?.querySelector('.panel')?.getBoundingClientRect().y < y-30),before.y);
    assert.equal(await result(page).textContent(),shortRewrite);
    const after = await panel(page).boundingBox();
    assert.ok(Math.abs((before.y-after.y)-70)<3,`Panel should track page scroll: ${before.y} -> ${after.y}`);
    await page.getByRole('button',{name:'Copy',exact:true}).click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),shortRewrite);
    await page.keyboard.press('Escape');
    assert.equal(await panel(page).count(),0);

    // Nested scroll containers also move the anchor without dismissing its panel.
    await fresh();
    await selectText(page,'nested');
    const nestedBefore = await panel(page).boundingBox();
    await page.evaluate(() => document.querySelector('#scroller').scrollTop += 40);
    await page.waitForFunction(y => [...document.querySelectorAll('div')].some(el=>el.shadowRoot?.querySelector('.panel')?.getBoundingClientRect().y < y-20),nestedBefore.y);
    const nestedAfter = await panel(page).boundingBox();
    assert.ok(Math.abs((nestedBefore.y-nestedAfter.y)-40)<3);
    await close(page);

    // Only the selected live draft text is rewritten; input events reach the editor.
    await fresh();
    await page.evaluate(() => {window.__inputEvents=0;document.querySelector('#draft').addEventListener('input',()=>window.__inputEvents++);});
    await selectDraft();
    await rewrite(page,'Humorous');
    assert.equal(await page.evaluate(()=>window.__requests.find(message=>message.type==='rewrite').text),'Please review this email.');
    await page.getByRole('button',{name:'Replace selection'}).click();
    assert.equal(await page.locator('#draft').inputValue(),`Before. ${shortRewrite} After.`);
    assert.ok(await page.evaluate(()=>window.__inputEvents>0));

    // Nested rich text (email composer shape) preserves surrounding content and undo.
    await fresh();
    await selectText(page,'rich-selection');
    await rewrite(page);
    await page.getByRole('button',{name:'Replace selection'}).click();
    assert.equal((await page.locator('#rich').innerText()).replace(/\u00a0/g,' '),`Before. ${shortRewrite} After.`);
    await page.locator('#rich').focus();
    await page.keyboard.press('Control+z');
    assert.equal((await page.locator('#rich').innerText()).replace(/\u00a0/g,' '),'Before. Please review this email. After.');

    // Rendered paragraph breaks differ from DOM Range text in live email drafts.
    await fresh();
    await page.evaluate(() => {
      document.querySelector('#rich').innerHTML='<p>Hello Alex,</p><p>Please review the proposal.</p><div>Thanks!</div>';
    });
    await selectText(page,'rich');
    await rewrite(page);
    const multilinePayload = await page.evaluate(()=>window.__requests.find(message=>message.type==='rewrite').text);
    assert.match(multilinePayload,/Hello Alex,\n+Please review the proposal\.\n+Thanks!/);
    await page.getByRole('button',{name:'Replace selection'}).click();
    assert.equal((await page.locator('#rich').innerText()).trim(),shortRewrite);
    assert.equal(await panel(page).count(),0);

    // An actual edit inside a captured rich-text range must still be rejected.
    await fresh();
    await selectText(page,'rich-selection');
    await rewrite(page);
    await page.evaluate(() => document.querySelector('#rich-selection').firstChild.textContent='This draft has changed.');
    await page.getByRole('button',{name:'Replace selection'}).click();
    assert.equal(await page.locator('#rich').innerText(),'Before. This draft has changed. After.');
    assert.match(await result(page).textContent(),/changed|select.*again/i);
    await close(page);

    // If an editor changes in the meantime, replacement must not overwrite the new draft.
    await fresh();
    await selectDraft();
    await rewrite(page);
    await page.evaluate(() => document.querySelector('#draft').value='New draft: do not overwrite.');
    await page.getByRole('button',{name:'Replace selection'}).click();
    assert.equal(await page.locator('#draft').inputValue(),'New draft: do not overwrite.');
    assert.match(await result(page).textContent(),/changed|select.*again/i);
    await close(page);

    // Long output expands from the short state and stays bounded, with overflow scroll.
    await fresh();
    await selectText(page,'editable');
    await rewrite(page);
    const small = await panel(page).boundingBox();
    await page.evaluate(() => window.__rewriteReply={text:'A longer rewritten email with useful details. '.repeat(120)});
    await rewrite(page,'Short & sweet');
    const large = await panel(page).boundingBox();
    assert.ok(large.width>small.width,`Expected width to grow: ${small.width} -> ${large.width}`);
    assert.ok(large.height>small.height,`Expected height to grow: ${small.height} -> ${large.height}`);
    assert.ok(large.width<=640 && large.height<=976 && large.y>=0 && large.y+large.height<=1000);
    assert.ok(await result(page).evaluate(el=>el.scrollHeight>el.clientHeight));
    await page.setViewportSize({width:420,height:520});
    await page.waitForFunction(() => [...document.querySelectorAll('div')].some(el=>{const rect=el.shadowRoot?.querySelector('.panel')?.getBoundingClientRect();return rect && rect.right<=420 && rect.bottom<=520;}));
    const narrow = await panel(page).boundingBox();
    assert.ok(narrow.width<=396 && narrow.height<=496);
    await page.screenshot({path:process.env.SCREENSHOT_PATH || '/tmp/rephrase-studio-preview.png'});
    await page.setViewportSize({width:1280,height:1000});

    // Simulate injection into an about:blank rich-text iframe used by mail composers.
    await fresh();
    await page.evaluate(() => {document.body.innerHTML='<iframe title="Compose email"></iframe>';});
    const frame = page.frames().find(frame=>frame!==page.mainFrame());
    assert.ok(frame);
    await frame.setContent('<div id="compose" contenteditable="true"><p>Hello, <span id="selection">Please review this email.</span> Thanks.</p></div>');
    await frame.addScriptTag({path:path.join(__dirname,'..','content.js')});
    await selectText(frame,'selection');
    await rewrite(frame);
    await frame.getByRole('button',{name:'Replace selection'}).click();
    assert.equal((await frame.locator('#compose').innerText()).replace(/\u00a0/g,' '),`Hello, ${shortRewrite} Thanks.`);
    assert.deepEqual(errors,[]);
    console.log('PASS Chromium UI: automatic local Ollama setup, editable-only activation, page/nested scroll, adaptive panel, live textarea/rich-text/iframe replacement, undo, stale draft protection, copy and Escape. Chrome messaging/Ollama mocked.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
