import { extension } from './platform.js';
import { api } from './api.js';
import { icon, esc, toast, applyTheme } from './ui.js';
import { enhanceNotes } from './note-tools.js';
import { renderAudioNotes } from './audio-notes.js';
import { safeUrl } from './core.js';
const query = new URL(location.href).searchParams,
  id = query.get('id'),
  highlightId = query.get('highlight') || '',
  sourceTab = Number(query.get('tab')) || 0;
const root = document.querySelector('#app');
let audioCleanup = () => {};
async function init() {
  const state = await api('snapshot'),
    page = state.pages.find((p) => p.id === id);
  if (!page) throw new Error('This source no longer exists. Open a new quick note.');
  applyTheme(state.settings.theme);
  document.title = 'Quick note — ' + page.title;
  root.innerHTML = `<header class="reader-bar"><div class="brand">${icon('logo', 30)}margin <span class="muted small">/ quick notes</span></div><button id="source">Back to source</button><button id="library">Library</button></header><main class="capture-page"><span class="eyebrow">Keep reading. Capture an idea.</span><h1>${esc(page.title)}</h1><p class="muted small">${highlightId ? 'Attached to the selected highlight.' : 'Notes and audio are attached to this source.'} Keep this tab open while recording; you can switch back and highlight the source.</p><form id="quick-form"><div class="modal-body"><label class="field">Quick note<textarea name="note" dir="auto" rows="5" placeholder="Type a thought, record your voice, or dictate…"></textarea></label></div><div class="row wrap"><button type="submit" class="primary">Save note & audio</button><span id="save-status" class="muted small" role="status"></span></div></form><div class="section-label">Saved voice notes</div><div id="saved-audio"></div></main>`;
  const form = root.querySelector('form');
  enhanceNotes(form);
  if (query.get('mode') === 'voice') form.querySelector('.note-assist').open = true;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = form.querySelector('[type=submit]');
    b.disabled = true;
    try {
      let tasks = [];
      form.dispatchEvent(new CustomEvent('margin-before-submit', { detail: { tasks } }));
      await Promise.all(tasks);
      const note = form.querySelector('[name=note]').value;
      if (note.trim()) await api('append-note', { pageId: id, highlightId, text: note });
      form.querySelector('[name=note]').value = '';
      tasks = [];
      form.dispatchEvent(
        new CustomEvent('margin-save-attachments', {
          detail: { tasks, target: { pageId: id, highlightId } },
        }),
      );
      await Promise.all(tasks);
      form.querySelector('[name=note]').value = '';
      root.querySelector('#save-status').textContent = 'Saved locally. You can keep adding notes.';
      await loadAudio();
    } catch (error) {
      root.querySelector('#save-status').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  root.querySelector('#library').onclick = () => api('open-library', { id });
  root.querySelector('#source').onclick = async () => {
    if (sourceTab) {
      try {
        await extension.tabs.update(sourceTab, { active: true });
        return;
      } catch {}
    }
    if (safeUrl(page.url)) await extension.tabs.create({ url: page.url });
    else toast('This is a standalone note. Open the library to read it.');
  };
  await loadAudio();
}
async function loadAudio() {
  audioCleanup();
  audioCleanup = await renderAudioNotes(root.querySelector('#saved-audio'), {
    pageId: id,
    highlightId,
  });
}
window.addEventListener('pagehide', () => audioCleanup(), { once: true });
init().catch((e) => (root.innerHTML = `<p class="loading">${esc(e.message)}</p>`));
