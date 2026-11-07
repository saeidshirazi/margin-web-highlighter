import { extension } from './platform.js';
import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import { api } from './api.js';
import { createAnnotator } from './annotator.js';
let currentUrl = location.href,
  controller,
  disabled = false;
function article() {
  const clone = document.cloneNode(true);
  clone.querySelectorAll('[data-margin-ui]').forEach((n) => n.remove());
  const parsed = new Readability(clone).parse();
  const content = DOMPurify.sanitize(
    parsed?.content ||
      document.querySelector('article,main')?.innerHTML ||
      '<p>' + DOMPurify.sanitize(document.body.innerText) + '</p>',
    {
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
        'a',
      ],
      ALLOWED_ATTR: [],
    },
  );
  return {
    article: content,
    text:
      parsed?.textContent ||
      document.querySelector('article,main')?.innerText ||
      document.body.innerText,
    byline: parsed?.byline || '',
  };
}
function transcript() {
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return [];
  return [...document.querySelectorAll('ytd-transcript-segment-renderer')]
    .map((el) => ({
      time: el.querySelector('.segment-timestamp')?.textContent.trim() || '',
      text: el.querySelector('.segment-text')?.textContent.trim() || '',
    }))
    .filter((x) => x.text);
}
async function save(bookmarked, reader = false) {
  const segments = transcript();
  return api('save-page', {
    url: location.href,
    title: document.title,
    ...(bookmarked ? { bookmarked: true } : {}),
    ...(reader ? article() : {}),
    ...(segments.length
      ? {
          type: 'youtube',
          transcript: segments,
          text: segments.map((x) => x.time + ' ' + x.text).join('\n'),
        }
      : {}),
  });
}
async function start() {
  const data = await api('page-data', { url: location.href });
  disabled = data.settings.disabledSites.includes(location.hostname);
  controller?.dispose();
  controller = null;
  if (disabled) return;
  controller = createAnnotator({
    load: () => api('page-data', { url: location.href }),
    create: async (input) => {
      const page = await save();
      return api('add-highlight', { ...input, pageId: page.id });
    },
    update: (id, patch, draftToken) => api('update-highlight', { id, patch, draftToken }),
    repair: (id, input) => api('repair-highlight', { id, ...input }),
    remove: (id) => api('delete-highlight', { id }),
    restore: (item) => api('restore-highlight', { item }),
    onLibrary: async () => {
      const { page } = await api('page-data', { url: location.href });
      await api('open-library', { id: page?.id });
    },
    onReader: async () => {
      const p = await save(false, true);
      await api('open-reader', { id: p.id });
    },
    onPanel: () => api('open-panel'),
    onColor: (color) => api('set-color', { color }),
    onProofread: (text) => api('proofread-note', { text }),
    onNoteDraft: (id, draft) => api('note-draft', { id, ...draft }),
    onCapture: (mode, item) =>
      api('open-capture', { mode, title: document.title, highlightId: item?.id }),
  });
}
extension.runtime.onMessage.addListener((message, _sender, reply) => {
  (async () => {
    if (message.action === 'status') return { disabled, url: location.href, title: document.title };
    if (message.action === 'video-status' || message.action === 'video-seek') {
      if (!/(^|\.)youtube\.com$/.test(location.hostname)) return null;
      const video = document.querySelector('video');
      if (message.action === 'video-seek' && video && Number.isFinite(message.seconds))
        video.currentTime = Math.max(0, message.seconds);
      return {
        url: location.href,
        currentTime: video?.currentTime || 0,
        playing: video ? !video.paused : false,
      };
    }
    if (message.action === 'bookmark') {
      const page = await save(true);
      controller?.toast('Page saved to your library');
      return page;
    }
    if (message.action === 'reader') {
      const page = await save(false, true);
      await api('open-reader', { id: page.id });
      return page;
    }
    if (message.action === 'capture') {
      return save(false, true);
    }
    if (message.action === 'focus') {
      controller?.focus(message.id);
      return true;
    }
    if (message.action === 'repair') {
      if (!controller)
        throw new Error('Reload this source and resume Margin before repairing a highlight.');
      return controller.startRepair(message.id);
    }
    if (disabled) throw new Error('Margin is paused on this site. Resume it in the popup.');
    await controller?.action(message.action);
    return true;
  })()
    .then((data) => reply({ ok: true, data }))
    .catch((e) => reply({ ok: false, error: e.message }));
  return true;
});
extension.storage.onChanged.addListener((changes) => {
  if (changes.revision) {
    api('page-data', { url: location.href })
      .then((data) => {
        const now = data.settings.disabledSites.includes(location.hostname);
        if (now !== disabled) return start();
        return controller?.refresh();
      })
      .catch(() => {});
  }
});
// Handles single-page navigation while keeping highlights tied to the current URL.
setInterval(() => {
  if (currentUrl !== location.href) {
    currentUrl = location.href;
    start().catch(() => {});
  }
}, 800);
start().catch(() => {});
