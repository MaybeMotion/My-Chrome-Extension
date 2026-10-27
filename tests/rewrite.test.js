import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rewrite, testConnection, clearLegacySettings} from '../background.js';
const storage = {get: async () => ({})};
const tags = {ok: true, json: async () => ({models: [{name: 'qwen2.5:3b'}]})};
const stream = items => ({ok: true, body: new ReadableStream({start(controller) {for (const item of items) controller.enqueue(new TextEncoder().encode(JSON.stringify(item) + '\n')); controller.close();}})});
const ok = content => stream([{message: {content}}, {done: true}]);
const fetchWithChat = chat => async (url, options) => url.endsWith('/api/tags') ? tags : chat(url, options);

test('installation and updates remove legacy keys and connection settings', async () => {
  for (const reason of ['install', 'update']) {
    let removed;
    await clearLegacySettings({reason}, {remove: async keys => {removed = keys;}});
    assert.deepEqual(removed, ['apiKey', 'ollamaUrl', 'ollamaModel']);
  }
  await clearLegacySettings({reason: 'chrome_update'}, {remove: () => {throw new Error('must not run');}});
});

test('all four tones use a local installed Ollama model and preserve text as user content', async () => {
  for (const tone of ['friendly', 'professional', 'humorous', 'concise']) {
    const result = await rewrite({text: 'Please review the proposal.', tone}, storage, fetchWithChat(async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/chat');
      assert.equal(options.method, 'POST');
      assert.deepEqual(options.headers, {'Content-Type': 'application/json'});
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'qwen2.5:3b');
      assert.equal(body.stream, true);
      assert.equal(body.messages[1].content, 'Please review the proposal.');
      assert.match(body.messages[0].content, /Preserve meaning/);
      return ok('  Could you review the proposal?  ');
    }));
    assert.equal(result, 'Could you review the proposal?');
  }
});
test('automatic local connection ignores legacy storage and caller endpoint/model overrides', async () => {
  const legacy = {get: async () => {throw new Error('must not read legacy connection settings');}};
  let calls = 0;
  const value = await rewrite({text: 'Hi', tone: 'concise', endpoint: 'https://remote.example', model: 'cloud-model'}, legacy, async (url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/api/tags')) {
      assert.equal(url, 'http://127.0.0.1:11434/api/tags');
      return tags;
    }
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(JSON.parse(options.body).model, 'qwen2.5:3b');
    return ok('Hello');
  });
  assert.equal(value, 'Hello');
  assert.equal(calls, 2);
});
test('invalid selections are rejected before storage and network access', async () => {
  const unused = {get: () => {throw new Error('must not access storage');}};
  for (const input of [{text: '', tone: 'friendly'}, {text: 'x'.repeat(8001), tone: 'friendly'}, {text: 'hi', tone: 'evil'}, {text: null, tone: 'friendly'}]) {
    await assert.rejects(rewrite(input, unused), /Select between/);
  }
});
test('connection check automatically uses the Ollama app and Qwen without configuration', async () => {
  const result = await testConnection({endpoint: 'https://remote.example', model: 'different-model'}, async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/tags');
    assert.equal(options.redirect, 'error');
    return {ok: true, json: async () => ({models: [{name: 'qwen2.5:3b'}, {name: 'qwen:cloud', remote_host: 'https://ollama.com'}, {name: 'other', remote_model: 'other'}, {name: 'x:cloud-cloud'}]})};
  });
  assert.deepEqual(result, {models: ['qwen2.5:3b'], modelAvailable: true});
});
test('uninstalled or cloud models never receive selected text', async () => {
  let calls = 0;
  await assert.rejects(rewrite({text: 'secret draft', tone: 'concise'}, storage, async url => {
    calls++;
    assert.match(url, /\/api\/tags$/);
    return {ok: true, json: async () => ({models: [{name: 'qwen2.5:3b', remote_host: 'https://ollama.com'}]})};
  }), /not installed/);
  assert.equal(calls, 1);
});
test('connection, blocked origin, missing model, service errors and empty responses are actionable', async () => {
  const input = {text: 'hi', tone: 'friendly'};
  await assert.rejects(rewrite(input, storage, async () => {throw new TypeError('Failed to fetch');}), /Open the Ollama app/);
  await assert.rejects(rewrite(input, storage, async () => {throw new DOMException('', 'TimeoutError');}), /took too long/);
  await assert.rejects(rewrite(input, storage, async () => ({ok: false, status: 403})), /OLLAMA_ORIGINS/);
  await assert.rejects(rewrite(input, storage, fetchWithChat(async () => ({ok: false, status: 404}))), /ollama pull/);
  await assert.rejects(rewrite(input, storage, fetchWithChat(async () => ({ok: false, status: 500, json: async () => ({error: 'model needs more memory'})}))), /more memory/);
  await assert.rejects(rewrite(input, storage, fetchWithChat(async () => ok('  '))), /no rewrite/);
  await assert.rejects(testConnection({}, async () => ({ok: true, json: async () => ({})})), /model list/);
});


test('streamed tokens are collected across chunk boundaries and incomplete or error streams fail', async () => {
  const input = {text: 'hi', tone: 'friendly'};
  const data = '{"message":{"content":"Hello "}}\n{"message":{"content":"there"},"done":true}\n';
  const response = {ok: true, body: new ReadableStream({start(controller) { for (const part of [data.slice(0, 9), data.slice(9, 40), data.slice(40)]) controller.enqueue(new TextEncoder().encode(part)); controller.close(); }})};
  assert.equal(await rewrite(input, storage, fetchWithChat(async () => response)), 'Hello there');
  await assert.rejects(rewrite(input, storage, fetchWithChat(async () => stream([{message: {content: 'Partial'}}]))), /stopped before/);
  await assert.rejects(rewrite(input, storage, fetchWithChat(async () => stream([{error: 'Out of memory'}]))), /Out of memory/);
});
