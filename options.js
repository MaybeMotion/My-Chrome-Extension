const status = document.querySelector('#status');
const check = document.querySelector('#test-connection');
const copy = document.querySelector('#copy-origin');
const command = document.querySelector('#ollama-origin-command');

// Use the installed extension's origin, which can change if loaded from a new folder.
if (chrome.runtime.id) {
  command.textContent = `launchctl setenv OLLAMA_ORIGINS "chrome-extension://${chrome.runtime.id}"`;
  copy.disabled = false;
}

// Old versions exposed configuration fields; the local app connection is now automatic.
const setup = chrome.storage.local.remove(['apiKey', 'ollamaUrl', 'ollamaModel']);
setup.catch(() => { status.textContent = 'Could not refresh local setup. Reopen this page and try again.'; });

check.onclick = async () => {
  check.disabled = true;
  status.textContent = 'Checking the Ollama app on this Mac…';
  try {
    await setup;
    const result = await chrome.runtime.sendMessage({type: 'ollama:test'});
    if (result?.error) throw new Error(result.error);
    if (!Array.isArray(result?.models)) throw new Error('No connection response. Reload this page and try again.');
    status.textContent = result.modelAvailable
      ? 'Ready when you are. Qwen 2.5 3B is installed. Highlight some writing and choose a tone. The first rewrite may take longer while the model loads.'
      : 'Ollama is running. Install Qwen 2.5 3B with ollama pull qwen2.5:3b, then check again.';
  } catch (error) {
    status.textContent = error.message || 'Could not connect. Open the Ollama app and try again.';
  } finally {
    check.disabled = false;
  }
};

copy.onclick = async () => {
  try {
    await navigator.clipboard.writeText(command.textContent);
    copy.textContent = 'Copied ✓';
    setTimeout(() => { copy.textContent = 'Copy command'; }, 1800);
  } catch {
    copy.textContent = 'Select and copy the command above';
  }
};
