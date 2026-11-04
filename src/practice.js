import { extension } from './platform.js';
import { api } from './api.js';
import { createAnnotator } from './annotator.js';
import { applyTheme, icon, toast } from './ui.js';

const url = 'local://practice/welcome';
const article =
  '<h1>A little practice, a lasting idea</h1><p id="practice-quote">A useful highlight begins with something you want to remember.</p><p id="practice-second">Select a sentence, choose a color, and add a thought in your own words.</p><h2>Make it yours</h2><p>Your notes and colors help a source mean more when you return to it. Open the library to search for a word you highlighted, then download a full backup.</p>';
const preferences = await api('preferences');
applyTheme(preferences.theme);
document.querySelector('#app').innerHTML =
  `<main class="practice-page"><div class="row between wrap"><div class="brand">${icon('logo', 32)}<strong>Margin · Practice page</strong></div><button id="practice-library">Open your library</button></div><p class="practice-intro">This page stays on your device. Select a sentence below and pick a color. Click the highlight to add a note. Your highlights will be saved in a practice source that you can delete later.</p><article id="practice-article">${article}</article><p class="muted small">Nothing is sent to a service. For real websites, refresh the tab after installing Margin and use the same selection toolbar.</p></main>`;
const load = () => api('page-data', { url });
const controller = createAnnotator({
  root: document.querySelector('#practice-article'),
  load,
  create: async (input) => {
    const page = await api('save-page', {
      url,
      title: 'Margin practice page',
      type: 'web',
      article,
      text: document.querySelector('#practice-article').textContent,
    });
    return api('add-highlight', { ...input, pageId: page.id });
  },
  update: (id, patch) => api('update-highlight', { id, patch }),
  repair: (id, input) => api('repair-highlight', { id, ...input }),
  remove: (id) => api('delete-highlight', { id }),
  restore: (item) => api('restore-highlight', { item }),
  onColor: (color) => api('set-color', { color }),
  onLibrary: async () => api('open-library', { id: (await load()).page?.id }),
});
document.querySelector('#practice-library').onclick = () =>
  api('open-library').catch((e) => toast(e.message));
extension.storage.onChanged.addListener((changes) => {
  if (changes.revision) controller.refresh().catch((e) => toast(e.message));
});
window.addEventListener('pagehide', () => controller.dispose(), { once: true });
