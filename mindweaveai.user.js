// ==UserScript==
// @name         Page AI Assistant
// @namespace    https://local.userscript/page-ai-assistant
// @version      2.0.0
// @description  Floating AI assistant that can read the current page and chat about it via any OpenAI-compatible API
// @author       you
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ---------- storage (plain localStorage, namespaced, no GM_* required) ----------
  const NS = '__pai_v2_';

  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(NS + key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function lsSet(key, value) {
    try {
      localStorage.setItem(NS + key, value);
    } catch (e) {
      /* storage unavailable, ignore */
    }
  }

  function getCfg() {
    return {
      apiKey: lsGet('apiKey', ''),
      baseUrl: lsGet('baseUrl', 'https://api.openai.com/v1'),
      model: lsGet('model', 'gpt-4o-mini'),
      temperature: lsGet('temperature', '0.4'),
    };
  }

  function setCfg(cfg) {
    lsSet('apiKey', cfg.apiKey);
    lsSet('baseUrl', cfg.baseUrl);
    lsSet('model', cfg.model);
    lsSet('temperature', cfg.temperature);
  }

  function isConfigured() {
    const cfg = getCfg();
    return !!cfg.apiKey && !!cfg.baseUrl && !!cfg.model;
  }

  // ---------- page content extraction ----------
  function getPageContext() {
    const selection = window.getSelection ? window.getSelection().toString().trim() : '';
    if (selection && selection.length > 20) {
      return { kind: 'selection', text: selection.slice(0, 12000) };
    }
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, svg, iframe, nav, footer').forEach((el) => el.remove());
    const text = clone.innerText.replace(/\n{3,}/g, '\n\n').trim();
    return { kind: 'page', text: text.slice(0, 12000) };
  }

  // ---------- API call (plain fetch, no GM_xmlhttpRequest) ----------
  async function askAI(messages, onDone, onError) {
    const cfg = getCfg();
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + cfg.apiKey,
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: Number(cfg.temperature) || 0.4,
          messages,
        }),
      });
      const data = await res.json();
      if (data.error) {
        onError(data.error.message || 'API error');
        return;
      }
      const content =
        data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : '(empty response)';
      onDone(content);
    } catch (e) {
      onError(
        'Request failed: ' +
          e.message +
          '. If this is a CORS error, the API endpoint is refusing direct browser requests — that needs GM_xmlhttpRequest support from your userscript manager, or a proxy.'
      );
    }
  }

  // ---------- styles ----------
  const style = document.createElement('style');
  style.textContent = `
    #pai-fab {
      position: fixed; top: 50%; right: 16px; transform: translateY(-50%);
      width: 46px; height: 46px; border-radius: 50%;
      background: linear-gradient(135deg,#6366f1,#8b5cf6);
      box-shadow: 0 4px 14px rgba(0,0,0,.3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; z-index: 2147483647; user-select: none;
      font-size: 20px; color: #fff; transition: transform .15s ease;
    }
    #pai-fab:hover { transform: translateY(-50%) scale(1.08); }
    #pai-panel {
      position: fixed; top: 50%; right: 72px; transform: translateY(-50%);
      width: 340px; max-height: 70vh; background: #1e1e26; color: #eee;
      border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.45);
      z-index: 2147483647; display: none; flex-direction: column;
      font: 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      overflow: hidden; border: 1px solid #333;
    }
    #pai-panel.open { display: flex; }
    #pai-tabs { display: flex; border-bottom: 1px solid #333; }
    #pai-tabs button {
      flex: 1; background: none; border: none; color: #aaa; padding: 10px;
      cursor: pointer; font-size: 12px; font-weight: 600; letter-spacing: .3px;
    }
    #pai-tabs button.active { color: #fff; border-bottom: 2px solid #8b5cf6; }
    .pai-view { display: none; flex-direction: column; padding: 12px; gap: 8px; overflow-y: auto; }
    .pai-view.active { display: flex; }
    #pai-chat-log { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; min-height: 200px; max-height: 320px; }
    .pai-msg { padding: 8px 10px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; }
    .pai-msg.user { background: #34344a; align-self: flex-end; }
    .pai-msg.ai { background: #2a2a35; align-self: flex-start; }
    #pai-input-row { display: flex; gap: 6px; }
    #pai-input {
      flex: 1; resize: none; background: #14141a; color: #eee; border: 1px solid #333;
      border-radius: 8px; padding: 8px; font: inherit; height: 40px;
    }
    #pai-send, .pai-btn {
      background: #6366f1; color: #fff; border: none; border-radius: 8px;
      padding: 0 12px; cursor: pointer; font-weight: 600;
    }
    .pai-btn.secondary { background: #333; }
    label.pai-label { font-size: 11px; color: #999; margin-bottom: 2px; display: block; }
    input.pai-field, select.pai-field {
      width: 100%; background: #14141a; color: #eee; border: 1px solid #333;
      border-radius: 6px; padding: 6px 8px; font: inherit; margin-bottom: 8px;
    }
    #pai-status { font-size: 11px; color: #888; }
  `;
  document.head ? document.head.appendChild(style) : document.documentElement.appendChild(style);

  // ---------- build UI ----------
  const fab = document.createElement('div');
  fab.id = 'pai-fab';
  fab.textContent = '✦';
  fab.title = 'Page AI Assistant';

  const panel = document.createElement('div');
  panel.id = 'pai-panel';
  panel.innerHTML = `
    <div id="pai-tabs">
      <button data-tab="chat" class="active">Chat</button>
      <button data-tab="settings">Settings</button>
    </div>
    <div class="pai-view active" data-view="chat">
      <div id="pai-chat-log"></div>
      <div id="pai-input-row">
        <textarea id="pai-input" placeholder="Ask about this page..."></textarea>
        <button id="pai-send">Send</button>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="pai-btn secondary" id="pai-summarize" style="flex:1;">Summarize page</button>
      </div>
      <div id="pai-status"></div>
    </div>
    <div class="pai-view" data-view="settings">
      <label class="pai-label">API Base URL</label>
      <input class="pai-field" id="pai-cfg-url" placeholder="https://api.openai.com/v1" />
      <label class="pai-label">API Key</label>
      <input class="pai-field" id="pai-cfg-key" type="password" placeholder="sk-..." />
      <label class="pai-label">Model</label>
      <input class="pai-field" id="pai-cfg-model" placeholder="gpt-4o-mini" />
      <label class="pai-label">Temperature</label>
      <input class="pai-field" id="pai-cfg-temp" type="number" min="0" max="2" step="0.1" />
      <button class="pai-btn" id="pai-cfg-save" style="width:100%;">Save</button>
      <div id="pai-cfg-status" style="font-size:11px;color:#888;margin-top:6px;"></div>
    </div>
  `;

  document.documentElement.appendChild(fab);
  document.documentElement.appendChild(panel);

  // ---------- tab switching ----------
  panel.querySelectorAll('#pai-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('#pai-tabs button').forEach((b) => b.classList.remove('active'));
      panel.querySelectorAll('.pai-view').forEach((v) => v.classList.remove('active'));
      btn.classList.add('active');
      panel.querySelector('.pai-view[data-view="' + btn.dataset.tab + '"]').classList.add('active');
    });
  });

  function showTab(name) {
    panel.querySelectorAll('#pai-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    panel.querySelectorAll('.pai-view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  }

  // ---------- settings logic ----------
  function loadSettingsForm() {
    const cfg = getCfg();
    panel.querySelector('#pai-cfg-url').value = cfg.baseUrl;
    panel.querySelector('#pai-cfg-key').value = cfg.apiKey;
    panel.querySelector('#pai-cfg-model').value = cfg.model;
    panel.querySelector('#pai-cfg-temp').value = cfg.temperature;
  }

  panel.querySelector('#pai-cfg-save').addEventListener('click', () => {
    const cfg = {
      baseUrl: panel.querySelector('#pai-cfg-url').value.trim() || 'https://api.openai.com/v1',
      apiKey: panel.querySelector('#pai-cfg-key').value.trim(),
      model: panel.querySelector('#pai-cfg-model').value.trim() || 'gpt-4o-mini',
      temperature: panel.querySelector('#pai-cfg-temp').value || '0.4',
    };
    setCfg(cfg);
    panel.querySelector('#pai-cfg-status').textContent = 'Saved.';
    setTimeout(() => (panel.querySelector('#pai-cfg-status').textContent = ''), 1500);
  });

  // ---------- chat logic ----------
  const chatLog = panel.querySelector('#pai-chat-log');
  const statusEl = panel.querySelector('#pai-status');
  let history = [];

  function appendMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'pai-msg ' + (role === 'user' ? 'user' : 'ai');
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function sendToAI(userText) {
    if (!isConfigured()) {
      showTab('settings');
      panel.querySelector('#pai-cfg-status').textContent = 'Configure your API key first.';
      return;
    }
    appendMsg('user', userText);
    statusEl.textContent = 'Thinking...';

    const ctx = getPageContext();
    if (history.length === 0) {
      history.push({
        role: 'system',
        content:
          'You are an assistant embedded in the user\'s browser. You can see the text content of the page they are currently viewing. Use it to answer their questions concisely. Page URL: ' +
          location.href +
          '\n\nPage content (' + ctx.kind + '):\n' + ctx.text,
      });
    }
    history.push({ role: 'user', content: userText });

    askAI(
      history,
      (reply) => {
        history.push({ role: 'assistant', content: reply });
        appendMsg('ai', reply);
        statusEl.textContent = '';
      },
      (err) => {
        appendMsg('ai', 'Error: ' + err);
        statusEl.textContent = '';
      }
    );
  }

  panel.querySelector('#pai-send').addEventListener('click', () => {
    const input = panel.querySelector('#pai-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendToAI(text);
  });

  panel.querySelector('#pai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      panel.querySelector('#pai-send').click();
    }
  });

  panel.querySelector('#pai-summarize').addEventListener('click', () => {
    history = [];
    sendToAI('Summarize this page in a few bullet points.');
  });

  // ---------- fab toggle ----------
  let open = false;
  fab.addEventListener('click', () => {
    open = !open;
    panel.classList.toggle('open', open);
    if (open) {
      if (!isConfigured()) {
        showTab('settings');
      }
      loadSettingsForm();
    }
  });

  document.addEventListener('click', (e) => {
    if (open && !panel.contains(e.target) && !fab.contains(e.target)) {
      open = false;
      panel.classList.remove('open');
    }
  });
})();