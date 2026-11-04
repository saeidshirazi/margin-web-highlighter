import { extension } from './platform.js';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api } from './api.js';
import { icon, esc, toast, applyTheme } from './ui.js';
import { createAnnotator } from './annotator.js';
import { safeUrl } from './core.js';
import { findVideoTab, timestampSeconds } from './video.js';
const id = new URL(location.href).searchParams.get('id');
let state, page, controller;
const root = document.querySelector('#app');
async function init() {
  state = await api('snapshot');
  page = state.pages.find((p) => p.id === id);
  if (!page) throw new Error('This page is no longer in your library.');
  applyTheme(state.settings.theme);
  document.title = page.title + ' — Margin Reader';
  root.innerHTML = `<header class="reader-bar" data-margin-ui><div class="brand">${icon('logo', 23)}margin <span class="muted small">/ reader</span></div><label class="small">Theme <select id="theme">${['light', 'sepia', 'dark', 'contrast', 'auto'].map((t) => `<option ${t === state.settings.theme ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="small">Size <input id="size" type="range" min="14" max="36" value="${state.settings.readerSize}" aria-label="Font size" style="width:75px"></label><label class="small">Width <input id="width" type="range" min="440" max="1100" value="${state.settings.readerWidth}" aria-label="Reading width" style="width:65px"></label><label class="small">Spacing <input id="line" type="range" min="1.2" max="2.5" step="0.05" value="${state.settings.readerLine}" aria-label="Line spacing" style="width:65px"></label><button id="quick">Quick highlight</button><button id="library">${icon('book', 15)}Library</button><button id="print">Print</button></header><main class="reader"><div class="eyebrow">Saved for offline reading</div><h1>${esc(page.title)}</h1><p class="muted small">${esc(page.byline || '')}${safeUrl(page.url) ? ` · <a href="${esc(safeUrl(page.url))}" rel="noreferrer" target="_blank">Original source ${icon('external', 11)}</a>` : ''}</p><article id="article" class="reader-article"></article></main>`;
  const article = root.querySelector('#article');
  if (page.transcript?.length) {
    const follow = document.createElement('button');
    follow.textContent = 'Follow video';
    follow.id = 'follow-video';
    root.querySelector('.reader-bar').append(follow);
    let following = false,
      videoTimer;
    follow.onclick = async () => {
      following = !following;
      follow.textContent = following ? 'Stop following' : 'Follow video';
      clearInterval(videoTimer);
      if (following) {
        if (!(await findVideoTab(page.url))) {
          await extension.tabs.create({ url: safeUrl(page.url) });
          toast('Play the video in its tab. This transcript follows its timestamp.');
        }
        videoTimer = setInterval(async () => {
          const current = await findVideoTab(page.url);
          if (!current) return;
          const lines = [...article.querySelectorAll('.transcript-line')];
          const active = lines.findLast((el) => +el.dataset.seconds <= current.currentTime);
          for (const el of lines) el.classList.toggle('playing', el === active);
          if (active && current.playing)
            active.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 1500);
      }
    };
    window.addEventListener('pagehide', () => clearInterval(videoTimer), { once: true });
    for (const line of page.transcript) {
      const div = document.createElement('div');
      div.className = 'transcript-line';
      const time = document.createElement('a');
      const url = new URL(page.url);
      const seconds = timestampSeconds(line.time);
      div.dataset.seconds = seconds;
      url.searchParams.set('t', String(seconds));
      time.href = safeUrl(url.href);
      time.target = '_blank';
      time.rel = 'noreferrer';
      time.textContent = line.time;
      time.onclick = async (e) => {
        e.preventDefault();
        const current = await findVideoTab(page.url);
        if (current) {
          await extension.tabs.sendMessage(current.tab.id, { action: 'video-seek', seconds });
        } else await extension.tabs.create({ url: time.href });
      };
      const span = document.createElement('span');
      span.textContent = line.text;
      div.append(time, span);
      article.append(div);
    }
  } else if (page.article) {
    article.innerHTML = DOMPurify.sanitize(page.article, {
      ALLOWED_TAGS: [
        'p',
        'div',
        'span',
        'h1',
        'h2',
        'h3',
        'h4',
        'ul',
        'ol',
        'li',
        'blockquote',
        'pre',
        'code',
        'em',
        'strong',
        'b',
        'i',
        'br',
        'hr',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
      ],
      ALLOWED_ATTR: [],
    });
  } else if (page.type === 'note') {
    article.innerHTML = DOMPurify.sanitize(marked.parse(page.note || ''), {
      FORBID_TAGS: ['img', 'iframe', 'video', 'audio', 'style', 'form'],
      FORBID_ATTR: ['style'],
    });
  } else if (page.text) {
    article.textContent = page.text;
    article.style.whiteSpace = 'pre-wrap';
  } else {
    article.innerHTML =
      '<p>No offline copy has been saved yet.</p><p>Open the original page, click the Margin toolbar icon, and choose “Save for offline reading”. The article is then available here without a connection.</p>';
  }
  const adjust = () => {
    document.documentElement.style.setProperty('--reader-size', state.settings.readerSize + 'px');
    document.documentElement.style.setProperty('--reader-width', state.settings.readerWidth + 'px');
    document.documentElement.style.setProperty('--reader-line', state.settings.readerLine);
  };
  adjust();
  for (const [selector, key] of [
    ['#size', 'readerSize'],
    ['#width', 'readerWidth'],
    ['#line', 'readerLine'],
  ]) {
    root.querySelector(selector).oninput = (e) => {
      state.settings[key] = +e.target.value;
      adjust();
    };
    root.querySelector(selector).onchange = () =>
      api('settings', { [key]: state.settings[key] }).catch((e) => toast(e.message));
  }
  root.querySelector('#theme').onchange = async (e) => {
    applyTheme(e.target.value);
    await api('settings', { theme: e.target.value });
  };
  root.querySelector('#library').onclick = () => api('open-library', { id });
  root.querySelector('#print').onclick = () => window.print();
  controller = createAnnotator({
    root: article,
    load: async () => {
      const next = await api('page-data', { url: page.url });
      return next;
    },
    create: (input) => api('add-highlight', { ...input, pageId: id }),
    update: (id, patch) => api('update-highlight', { id, patch }),
    repair: (id, input) => api('repair-highlight', { id, ...input }),
    remove: (id) => api('delete-highlight', { id }),
    restore: (item) => api('restore-highlight', { item }),
    onColor: (color) => api('settings', { color }),
    onLibrary: () => api('open-library', { id }),
    onCapture: (mode, item) => api('open-capture', { pageId: id, highlightId: item?.id, mode }),
  });
  root.querySelector('#quick').onclick = () => controller.action('quick');
  const highlight = new URL(location.href).searchParams.get('highlight');
  if (highlight) setTimeout(() => controller.focus(highlight), 500);
  const repair = new URL(location.href).searchParams.get('repair');
  if (repair) controller.startRepair(repair).catch((e) => toast(e.message));
  extension.storage.onChanged.addListener((c) => {
    if (c.revision) controller.refresh().catch(() => {});
  });
}
init().catch((e) => (root.innerHTML = `<p class="loading">${esc(e.message)}</p>`));
