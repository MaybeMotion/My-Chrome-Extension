# Rephrase 1.1.5 ✦

A Chrome extension that rewrites selected text inside editable fields and email drafts using **Ollama on your own computer**. Choose Friendly, Professional, Humorous, or Short & sweet, then replace your selection or copy the rewrite.

## Downloads

- [HTML download page](downloads/rephrase-download-1.1.5.html) — download this file from GitHub and open it in Chrome; its button saves the embedded extension ZIP.
- [Complete extension ZIP](downloads/rephrase-extension-1.1.5.zip) — extract it and load the folder containing `manifest.json`.

## Install or update

1. Extract `rephrase-extension-1.1.5.zip` to a permanent folder on your computer.
2. In Chrome 119 or newer, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
3. To update an existing unpacked installation, replace its files and click **Reload** on its extension card. If you load from a new folder, remove or disable the old copy to avoid duplicate panels.
4. Reload existing website tabs, including Zoho Mail. Open Rephrase from the toolbar, then **Open studio & settings**.

The extension needs the whole folder, including JavaScript, CSS and the manifest. A single HTML file is a preview/settings page, not an installable Chrome extension.

## Local Ollama app setup (Mac)

There is no address, model field, API key or Save button to configure. Rephrase automatically uses **Qwen 2.5 3B (`qwen2.5:3b`)** in the Ollama app on your computer.

1. Install [Ollama for Mac](https://ollama.com/download/mac), then open it.
2. In Terminal, download the model once (skip this if it is already installed):

   ```sh
   ollama pull qwen2.5:3b
   ```

3. Open Rephrase’s studio and settings. Copy the `launchctl setenv OLLAMA_ORIGINS` command shown there and paste it into Terminal. The command already contains your installed extension’s exact ID.
4. Fully quit Ollama from its menu-bar icon and open it again. Keep it running while using Rephrase.
5. Click **Check local connection**. Once ready, highlight writing and choose a tone. There is nothing to enter or save.

Updating removes the old configurable connection settings and any previously saved OpenAI API key. The model is fixed to Qwen 2.5 3B. The initial model download is roughly 2 GB and needs internet; rewriting then runs locally and can work offline. Model speed depends on your hardware.

If a cold model loads slowly, run `ollama run qwen2.5:3b` in Terminal before using Rephrase. The extension collects streamed tokens for up to 120 seconds. If Ollama does not begin responding within 25 seconds, Rephrase asks you to load the model first.

### Connection troubleshooting

- Open the Ollama app and keep it running. `ollama list` in Terminal shows installed models.
- If Qwen is missing, run `ollama pull qwen2.5:3b`, then click **Check local connection** again.
- Keep Ollama’s default local app configuration. Rephrase connects automatically; you do not need to set up a network server or enter an address.
- If Chrome asks for local-network access, allow it for the extension. Permissions are also available from the extension’s Details page when supported by your browser.
- If Ollama returns HTTP 403, configure `OLLAMA_ORIGINS` to allow **this extension’s exact origin**. The setup page displays a complete Mac command, and `chrome://extensions` shows the extension ID. An origin looks like `chrome-extension://abcdefghijklmnopabcdefghijklmnop`. Replace `YOUR_EXTENSION_ID` below with the actual ID; do not paste the placeholder unchanged. Fully quit Ollama first, then restart it after setting the variable.

  **Windows (PowerShell)** — save the variable, then quit and restart Ollama so the new process inherits it:

  ```powershell
  [Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', 'chrome-extension://YOUR_EXTENSION_ID', 'User')
  ```

  **macOS app** — set the variable, then quit and relaunch the Ollama app:

  ```sh
  launchctl setenv OLLAMA_ORIGINS 'chrome-extension://YOUR_EXTENSION_ID'
  ```

  **Linux or a terminal-run Ollama server** — stop the existing server and launch with:

  ```sh
  OLLAMA_ORIGINS='chrome-extension://YOUR_EXTENSION_ID' ollama serve
  ```

  For a Linux systemd installation, set the same environment variable on the Ollama service using `systemctl edit ollama`, then reload systemd and restart that service. A variable set in your terminal will not change an already-running service. If you already allow other origins, preserve them in Ollama’s comma-separated list and add the extension origin.

## Selecting and replacing email drafts

Select text **inside the editable message body** of an email draft, choose a tone, then use **Replace selection**. The panel only appears for writable fields and editors. Selecting ordinary webpage text for copying does not open it; read-only fields and non-editable content are excluded. Textareas, normal text inputs and standard `contenteditable` rich text editors are supported. Rephrase runs in matching frames, including inherited blank editor frames used by some email composers.

The panel follows the selection when the page or an editor container scrolls. It expands for longer rewrites within the viewport and uses scrolling for very long results. Close it with ×, Escape, or by clicking outside. If your draft changes while a rewrite is running, select the text again before replacing it.

Zoho commonly uses rich text editing and may vary by account or release. The tests exercise editable text and framed editors; a live Zoho account was not available for validation. Custom canvas editors, closed shadow roots, browser-internal pages, the Chrome Web Store and some heavily controlled editors may not support direct replacement. **Copy** remains available for pasting manually. Review every rewrite before sending an email.

## Privacy

The extension sends only the selected text and tone to the Ollama app on your computer when you choose a tone. It does not send surrounding page content, analytics or browsing history, and never calls OpenAI. Model-list checks send no selected text. The connection is fixed internally to loopback and redirects are rejected. Rephrase checks that Qwen 2.5 3B is installed locally; cloud model entries are excluded. No connection settings or API keys are needed. Downloading the model requires internet access; inference uses the local model.

## Development and validation

No build step is required. Use the existing checkout directly.

```sh
npm ci --cache /tmp/rephrase-npm-cache
npm run check
npm test
npm run test:browser
```

To regenerate the ZIP and standalone HTML download page using Python 3 (no extra packages required):

```sh
python3 scripts/build_download.py
```

The builder reads the version from `manifest.json` and writes both files to `downloads/`. It works from any working directory and includes the extension source, tests, icons, setup instructions and builder in the ZIP. Generated downloads are excluded from the ZIP to avoid nesting archives.

The browser test uses `/usr/bin/chromium` by default; override `CHROMIUM_PATH` if needed. Unit tests cover Ollama request bodies, all tones, automatic local connection, legacy-settings cleanup, local model listing and connection/service failures. Browser tests mock Chrome messaging and model replies to exercise the interface and editor behavior, including editable-only triggering and ordinary webpage copy selections. No live Ollama model or Zoho account is required by the automated suite; test those on your own computer after installation.

Syntax checks, all eight backend tests and the Chromium UI suite passed for this release. Installed-extension loading could not be checked here because managed Chromium disables unpacked extensions; live Ollama inference and Zoho Mail remain local validation steps.

The extension uses a modern, sculpted violet monogram with transparent background, exported at Chrome’s toolbar and extension-list sizes.
