from pathlib import Path
import base64,json,zipfile
base=Path(__file__).resolve().parent.parent
downloads=base/'downloads'
downloads.mkdir(exist_ok=True)
manifest=json.loads((base/'manifest.json').read_text())
version=manifest['version']
archive=downloads/f'rephrase-extension-{version}.zip'
files=['manifest.json','background.js','content.js','options.html','options.js','popup.html','popup.js','ui.css','README.md','package.json','package-lock.json','studio-preview.png']
files += [str(p.relative_to(base)) for name in ['icons','tests','scripts'] for p in (base/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc']
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for name in files:z.write(base/name,f'rephrase-extension-{version}/'+name)
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for entry in [manifest['background']['service_worker'],manifest['options_page'],manifest['action']['default_popup'],*manifest['icons'].values(),*manifest['action']['default_icon'].values(),*manifest['content_scripts'][0]['js']]:
  assert f'rephrase-extension-{version}/'+entry in z.namelist()
payload=base64.b64encode(archive.read_bytes()).decode()
icon=base64.b64encode((base/'icons/128.png').read_bytes()).decode()
html='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rephrase __VERSION__ • Local Ollama app</title>
<style>:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#18161d;color:#f4efff}*{box-sizing:border-box}body{margin:0;padding:48px 20px}main{max-width:650px;margin:auto;padding:32px;background:#25212e;border:1px solid #494052;border-radius:22px}h1{font-size:32px;line-height:1.15;letter-spacing:-1px;margin:20px 0 12px}.badge{color:#c9adff;font-size:12px;letter-spacing:1px}p,li{color:#c0b7cb;line-height:1.7}a{color:#d2b7ff}a.download{display:block;margin:26px 0 12px;background:#c3a2ff;color:#251637;text-align:center;border-radius:12px;padding:16px;font-weight:700;text-decoration:none}a:focus-visible{outline:3px solid #fff;outline-offset:4px}small{color:#ac9bbd}h2{font-size:18px;margin-top:30px}ol{padding-left:22px}li{margin-bottom:12px}code{font-family:ui-monospace,monospace;background:#18161d;padding:3px 6px;border-radius:5px;overflow-wrap:anywhere}.command{padding:14px;display:block}#status{font-size:12px;overflow-wrap:anywhere}footer{font-size:12px;color:#a89ab6;border-top:1px solid #494052;padding-top:16px;margin-top:28px}</style></head>
<body><main><img src="data:image/png;base64,__ICON__" width="72" height="72" alt="Modern Rephrase violet monogram" style="display:block;margin-bottom:20px"><span class="badge">✦ REPHRASE · VERSION __VERSION__</span>
<h1>Your Mac. Your words.<br>No API bills.</h1>
<p>Use the <strong>Ollama app</strong> with <strong>Qwen 2.5 3B</strong>, just like your earlier setup. <strong>No address to enter, model settings or Save button.</strong> Open Ollama and click <strong>Check local connection</strong> in the extension.</p>
<a class="download" id="download" download="rephrase-extension-__VERSION__.zip" href="data:application/zip;base64,__ZIP__">Download Rephrase __VERSION__ ZIP</a>
<small>The complete extension is embedded in this HTML file. The download works without a server or internet connection.</small>
<p id="status" role="status">Open this HTML file in Chrome and click the download button above.</p>
<h2>Install or update</h2><ol>
<li>Download and extract the ZIP to a permanent folder.</li>
<li>Open <code>chrome://extensions</code> in Chrome, enable <strong>Developer mode</strong>, click <strong>Load unpacked</strong>, and choose the extracted folder containing <code>manifest.json</code>.</li>
<li>If updating an existing installation, replace the files in its current folder and click <strong>Reload</strong> on its extension card. Otherwise disable the old copy to avoid duplicate panels. Reload Zoho and other website tabs.</li>
</ol>
<h2>Use the Ollama app</h2><ol>
<li><a href="https://ollama.com/download/mac" target="_blank" rel="noreferrer">Install Ollama for Mac</a>, then open it.</li>
<li>Open Terminal and download the model once. Skip this step if it is already installed:<code class="command">ollama pull qwen2.5:3b</code></li>
<li>Open Rephrase from Chrome’s extension toolbar, then <strong>Open studio &amp; settings</strong>. Copy the Mac permission command shown there into Terminal. The extension fills in its own ID automatically.</li>
<li>Fully quit Ollama from its menu-bar icon, then reopen it. Keep it running while using Rephrase.</li>
<li>Click <strong>Check local connection</strong> in the extension. Once ready, highlight text inside an email draft, choose a tone, and click <strong>Replace selection</strong>.</li>
</ol>
<p>The panel stays open while scrolling and expands for longer text. The modern violet monogram is included. Selecting ordinary webpage text to copy never opens the panel; Rephrase appears only inside editable text fields and email drafts. Your selected text goes only to the Ollama app on your computer when you choose a tone.</p>
<footer>Chrome 119 or newer. The initial Qwen model download is roughly 2 GB and needs internet; rewriting runs locally afterward. Automated tests use mocked model replies; live Ollama and Zoho use need checking on your computer. Full instructions are in README.md inside the ZIP.</footer>
</main><script>
const link=document.getElementById('download');
try{
 const bytes=Uint8Array.from(atob(link.getAttribute('href').split(',')[1]),c=>c.charCodeAt(0));
 link.href=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
 link.addEventListener('click',()=>{document.getElementById('status').textContent='Check Downloads for rephrase-extension-__VERSION__.zip, then extract it.'});
}catch{document.getElementById('status').textContent='Use the download button to save the embedded ZIP.'}
</script></body></html>'''
html=html.replace('__VERSION__',version).replace('__ICON__',icon).replace('__ZIP__',payload)
out=downloads/f'rephrase-download-{version}.html';out.write_text(html)
print(f'Created {archive.name} ({archive.stat().st_size:,} bytes) and {out.name} ({out.stat().st_size:,} bytes). ZIP integrity and manifest references verified.')
