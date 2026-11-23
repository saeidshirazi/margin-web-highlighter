import { extension } from './platform.js';
import { renderMarkdown } from './markup.js';
import { api } from './api.js';
import { icon, esc, toast, dialog, field, applyTheme } from './ui.js';
import { toMarkdown } from './core.js';
import { renderAudioNotes } from './audio-notes.js';
import { openReadAloud } from './read-aloud.js';
import { createDictation, speechAvailability } from './speech.js';
let releaseAudio = () => {};
let quickDictation;
const root = document.querySelector('#app');
let tab;
let renderVersion = 0;
const quickDrafts = new Map();
async function send(action, id) {
  try {
    return await extension.tabs.sendMessage(tab.id, { action, id });
  } catch {
    throw new Error('Reload this web page to activate Margin.');
  }
}
async function render() {
  const version = ++renderVersion;
  releaseAudio();
  quickDictation?.dispose();
  quickDictation = null;
  [tab] = await extension.tabs.query({ active: true, currentWindow: true });
  let url = tab?.url;
  try {
    url = (await send('status'))?.data?.url || url;
  } catch {}
  if (!url || !/^https?:|^file:/.test(url)) {
    root.innerHTML =
      '<div class="panel"><h2>Your page sidebar</h2><p class="muted">Open a website to view its highlights here. PDFs and saved articles have their own viewer in the library.</p><button id="library">Open library</button></div>';
    root.querySelector('#library').onclick = () => api('open-library');
    return;
  }
  const data = await api('page-data', { url });
  if (version !== renderVersion) return;
  applyTheme(data.settings.theme);
  root.innerHTML = `<div class="panel"><div class="row between"><div class="brand">${icon('logo', 24)}margin</div><button class="icon-btn" id="library" aria-label="Open library">${icon('external')}</button></div><h1>${esc(data.page?.title || tab.title || 'This page')}</h1><p class="muted small">${data.highlights.length} highlights · saved on your device</p><div class="row wrap"><button id="save">${icon('bookmark', 15)}Save</button><button id="reader">${icon('book', 15)}Reader</button><button id="quick">${icon('flash', 15)}Quick</button><button id="note">+ Page note</button><button id="copy">Copy</button></div><section class="quick-inline"><label class="field">Quick note<textarea id="quick-note-text" rows="3" placeholder="Capture a thought while highlighting…" dir="auto">${esc(quickDrafts.get(url) || '')}</textarea></label><div class="row wrap"><button id="quick-note-save" class="primary">Save quick note</button><button id="quick-dictate" type="button" class="quick-mic-btn" title="Voice to text" aria-label="Voice to text">${icon('mic', 15)} <span>Dictate</span></button><button id="record-voice">Record / dictate</button><button id="read-aloud">Read aloud</button></div><p id="quick-status" class="muted small" role="status"></p></section><div id="page-audio"></div>${data.page?.note ? `<div class="annotation note-preview">${renderMarkdown(data.page.note)}</div>` : ''}${data.highlights.map((h) => `<article class="annotation" style="--highlight:${h.color}"><blockquote>${esc(h.text)}</blockquote><div class="note-preview">${renderMarkdown(h.note || '')}</div><div class="tags">${h.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="row" style="margin-top:10px"><button class="ghost small" data-focus="${esc(h.id)}">Find on page</button><button class="ghost small" data-edit="${esc(h.id)}">Edit</button></div></article>`).join('')}${data.highlights.length ? '' : '<div class="empty" style="margin-top:25px;padding:20px;min-height:210px"><h3>A thought worth keeping?</h3><p class="small">Select text on this page and choose a color. It will appear here automatically.</p></div>'}</div>`;
  root.querySelector('#library').onclick = () => api('open-library', { id: data.page?.id });
  root.querySelector('#quick-note-text').oninput = (e) => quickDrafts.set(url, e.target.value);
  const speechSupported = !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
  const quickDictateBtn = root.querySelector('#quick-dictate');
  if (!speechSupported) {
    quickDictateBtn.disabled = true;
    quickDictateBtn.title =
      'Dictation is not available in this browser. Use Record / dictate instead.';
  } else {
    quickDictateBtn.onclick = async () => {
      const field = root.querySelector('#quick-note-text');
      const status = root.querySelector('#quick-status');
      if (!quickDictation) {
        quickDictation = createDictation({
          field,
          onState: (state) => {
            quickDictateBtn.classList.toggle('recording', state.active);
            quickDictateBtn.setAttribute('aria-pressed', state.active ? 'true' : 'false');
            quickDictateBtn.querySelector('span').textContent = state.active ? 'Stop' : 'Dictate';
            quickDictateBtn.title = state.active ? 'Listening… Click to stop' : 'Voice to text';
            status.textContent = state.message;
          },
        });
      }
      if (quickDictation.active) {
        await quickDictation.stop();
      } else {
        try {
          if (navigator.mediaDevices?.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
          }
          const lang = data.settings.voiceLanguage || 'en-US';
          let mode = 'local';
          try {
            const avail = await speechAvailability(lang);
            if (!avail.ready) mode = 'browser';
          } catch {
            mode = 'browser';
          }
          await quickDictation.start({ language: lang, mode, onlineConsent: true });
        } catch (e) {
          status.textContent = e.message;
        }
      }
    };
  }
  root.querySelector('#quick-note-save').onclick = async () => {
    await quickDictation?.stop().catch(() => {});
    const text = root.querySelector('#quick-note-text').value;
    if (!text.trim()) return;
    try {
      const p = data.page || (await api('save-page', { url, title: tab.title || url }));
      await api('append-note', { pageId: p.id, text });
      quickDrafts.delete(url);
      await render();
    } catch (e) {
      root.querySelector('#quick-status').textContent = e.message;
    }
  };
  root.querySelector('#record-voice').onclick = () =>
    api('open-capture', {
      pageId: data.page?.id,
      url,
      title: data.page?.title || tab.title,
      tabId: tab.id,
      mode: 'voice',
    }).catch((e) => toast(e.message));
  root.querySelector('#read-aloud').onclick = () =>
    openReadAloud(data.page?.text || data.highlights.map((h) => h.text).join('\n'));
  if (data.page)
    renderAudioNotes(root.querySelector('#page-audio'), { pageId: data.page.id })
      .then((fn) => (releaseAudio = fn))
      .catch((e) => toast(e.message));
  for (const [id, action] of [
    ['save', 'bookmark'],
    ['reader', 'reader'],
    ['quick', 'quick'],
  ])
    root.querySelector('#' + id).onclick = () =>
      send(action)
        .then((r) => {
          if (!r.ok) throw new Error(r.error);
          if (id === 'save') render();
        })
        .catch((e) => toast(e.message));
  root.querySelector('#copy').onclick = async () => {
    if (!data.page) return toast('Save this page first');
    await navigator.clipboard.writeText(toMarkdown([data.page], data.highlights));
    toast('Markdown copied');
  };
  root.querySelector('#note').onclick = () =>
    dialog({
      title: 'Page note',
      body: `<label class="field">Note · Markdown<textarea name="note">${esc(data.page?.note || '')}</textarea></label>${field('Tags', 'tags', data.page?.tags.join(', ') || '')}`,
      onSubmit: async (f) => {
        const saved = await api('save-page', {
          url,
          title: data.page?.title || tab.title,
          ...Object.fromEntries(f),
        });
        await render();
        return { pageId: saved.id };
      },
    });
  root
    .querySelectorAll('[data-focus]')
    .forEach((b) => (b.onclick = () => send('focus', b.dataset.focus)));
  root
    .querySelectorAll('[data-edit]')
    .forEach((b) => (b.onclick = () => api('open-library', { id: data.page.id })));
}
extension.tabs.onActivated.addListener(() => render().catch((e) => toast(e.message)));
extension.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === 'complete') render().catch(() => {});
});
extension.storage.onChanged.addListener((c) => {
  if (c.revision && !document.querySelector('dialog[open]')) render().catch(() => {});
});
render().catch((e) => (root.innerHTML = `<p class="panel">${esc(e.message)}</p>`));
