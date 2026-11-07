import { inCollection, collectionPath } from './organization.js';
export const VERSION = 2;
const COLORS = ['#ffe08a', '#a8e6cf', '#9ed5fa', '#d6bafa', '#ffb8ce'];
export const DEFAULT_SETTINGS = {
  colors: COLORS,
  color: COLORS[0],
  selectionToolbar: true,
  theme: 'light',
  readerSize: 20,
  readerWidth: 740,
  readerLine: 1.85,
  disabledSites: [],
  libraryLayout: 'grid',
  translationTarget: 'fa',
  voiceLanguage: 'en-US',
  detailWidth: 480,
};
export const uid = () => crypto.randomUUID();
export function canonicalUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:', 'file:', 'local:'].includes(url.protocol))
    throw new Error('Unsupported page address');
  if (!/^#(?:\/|!)/.test(url.hash)) url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_.+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
export const cleanTags = (value) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : String(value || '').split(','))
        .map((x) => String(x).trim().slice(0, 80))
        .filter(Boolean),
    ),
  ].slice(0, 50);
export function color(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Choose a six-digit hex color');
  return value.toLowerCase();
}
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:', 'file:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}
export const escapeHtml = (text) =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x],
  );
const searchSentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });
export function searchMatch(page, highlights, query) {
  query = query.trim();
  if (!query) return null;
  const expression = new RegExp(RegExp.escape(query), 'iu');
  const match = (kind, text, highlightId) => {
    const found = expression.exec(text || '');
    if (!found) return null;
    const index = found.index;
    const end = index + found[0].length;
    const windowStart = Math.max(0, index - 64);
    const windowEnd = Math.min(text.length, end + 94);
    const segment = searchSentences
      .segment(text.slice(windowStart, windowEnd))
      .containing(index - windowStart);
    const start = windowStart + segment.index;
    const finish = Math.max(end, start + segment.segment.length);
    return {
      kind,
      highlightId,
      before: (start && start === windowStart ? '…' : '') + text.slice(start, index),
      match: found[0],
      after: text.slice(end, finish) + (finish < text.length && finish === windowEnd ? '…' : ''),
      pdfPage:
        kind === 'text' && page.type === 'pdf'
          ? text.slice(0, index).split('\n\n').length
          : undefined,
    };
  };
  for (const highlight of highlights) {
    const hit =
      match('highlight', highlight.text, highlight.id) ||
      match('highlight-note', highlight.note, highlight.id) ||
      match('highlight', highlight.tags.join(' '), highlight.id);
    if (hit) return hit;
  }
  return (
    match('page-note', page.note) ||
    match('text', page.text) ||
    match('source', [page.title, page.url, ...page.tags].join(' '))
  );
}
function matchesSourceFilters(page, filters) {
  return (
    (!filters.collection || inCollection(page.collection, filters.collection)) &&
    (!filters.unfiled || !collectionPath(page.collection)) &&
    (!filters.bookmarked || page.bookmarked) &&
    (!filters.type || page.type === filters.type)
  );
}
export function searchPages(pages, highlights, filters = {}) {
  const query = (filters.query || '').trim();
  const byPage = new Map();
  for (const highlight of highlights) {
    if (!byPage.has(highlight.pageId)) byPage.set(highlight.pageId, []);
    byPage.get(highlight.pageId).push(highlight);
  }
  return pages
    .filter((page) => {
      const hs = byPage.get(page.id) || [];
      if (!matchesSourceFilters(page, filters)) return false;
      if (filters.tag && ![...page.tags, ...hs.flatMap((h) => h.tags)].includes(filters.tag))
        return false;
      if (filters.color && !hs.some((h) => h.color === filters.color)) return false;
      return !query || !!searchMatch(page, hs, query);
    })
    .sort((a, b) =>
      filters.sort === 'title'
        ? a.title.localeCompare(b.title)
        : filters.sort === 'oldest'
          ? a.updatedAt - b.updatedAt
          : b.updatedAt - a.updatedAt,
    );
}
export function searchHighlights(pages, highlights, filters = {}) {
  const sources = new Map(pages.map((page) => [page.id, page]));
  const query = (filters.query || '').trim();
  const expression = query ? new RegExp(RegExp.escape(query), 'iu') : null;
  return highlights
    .flatMap((highlight) => {
      const page = sources.get(highlight.pageId);
      if (!page || !matchesSourceFilters(page, filters)) return [];
      if (filters.color && highlight.color !== filters.color) return [];
      const tags = [...page.tags, ...highlight.tags];
      if (filters.tag && !tags.includes(filters.tag)) return [];
      if (
        expression &&
        ![highlight.text, highlight.note, page.title, page.url, ...tags].some((text) =>
          expression.test(text || ''),
        )
      )
        return [];
      return [{ page, highlight }];
    })
    .sort((a, b) => {
      if (filters.sort === 'title') return a.page.title.localeCompare(b.page.title);
      const difference = a.highlight.updatedAt - b.highlight.updatedAt;
      return filters.sort === 'oldest' ? difference : -difference;
    });
}
export function toMarkdown(pages, highlights) {
  return pages
    .map((p) => {
      const source = safeUrl(p.url);
      return `# ${p.title.replace(/[\r\n]/g, ' ')}\n\n${source ? `<${source}>\n\n` : ''}${p.tags.map((t) => '#' + t.replace(/\s/g, '-')).join(' ')}\n\n${p.note || ''}\n\n${p.summary ? '## Summary\n\n' + p.summary + '\n\n' : ''}${highlights
        .filter((h) => h.pageId === p.id)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(
          (h) =>
            `> ${h.text.replace(/\n/g, '\n> ')}\n\n${h.note || ''}\n\n${h.tags.map((t) => '#' + t.replace(/\s/g, '-')).join(' ')}\n\n`,
        )
        .join('')}`;
    })
    .join('\n---\n\n');
}
export function toHTML(pages, highlights) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Margin research export</title><style>body{max-width:780px;margin:60px auto;font:18px/1.7 system-ui;padding:24px}blockquote{border-left:4px solid #ddd;margin:20px 0;padding:12px 20px}pre{white-space:pre-wrap}article{break-after:page}a{overflow-wrap:anywhere}@media print{body{margin:0}}</style>${pages
    .map(
      (p) =>
        `<article><h1>${escapeHtml(p.title)}</h1><a href="${escapeHtml(safeUrl(p.url))}">${escapeHtml(p.url)}</a><p>${escapeHtml(p.tags.join(', '))}</p><pre>${escapeHtml(p.note)}</pre>${p.summary ? `<h2>Summary</h2><pre>${escapeHtml(p.summary)}</pre>` : ''}${highlights
          .filter((h) => h.pageId === p.id)
          .map(
            (h) =>
              `<blockquote style="border-color:${color(h.color)}"><mark style="background:${color(h.color)}">${escapeHtml(h.text)}</mark><pre>${escapeHtml(h.note)}</pre><small>${escapeHtml(h.tags.join(', '))}</small></blockquote>`,
          )
          .join('')}</article>`,
    )
    .join('')}</html>`;
}
export function csv(rows) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? '')
                .replace(/"/g, '""')
                .replace(/^(\s*[=+@-])/, "'$1") +
              '"',
          )
          .join(','),
      )
      .join('\r\n')
  );
}
export function reviewCard(card, correct, now = Date.now()) {
  const repetitions = correct ? (card.repetitions || 0) + 1 : 0;
  const interval = correct
    ? repetitions === 1
      ? 1
      : repetitions === 2
        ? 3
        : Math.max(4, Math.round((card.interval || 3) * 2.2))
    : 0;
  return {
    ...card,
    repetitions,
    interval,
    dueAt: now + (correct ? interval * 86400000 : 600000),
    updatedAt: now,
  };
}
export function validateBackup(data) {
  if (!data || data.format !== 'margin-backup' || ![1, VERSION].includes(data.version))
    throw new Error('Not a supported Margin backup (version 1 or 2 required)');
  if (
    !Array.isArray(data.pages) ||
    !Array.isArray(data.highlights) ||
    !Array.isArray(data.cards) ||
    !Array.isArray(data.assets || [])
  )
    throw new Error('Incomplete backup');
  const ids = new Set(),
    urls = new Set();
  const pages = data.pages.map((p) => {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.title !== 'string')
      throw new Error('Invalid or duplicate page');
    ids.add(p.id);
    const url = canonicalUrl(p.url);
    if (urls.has(url)) throw new Error('Duplicate page URL in backup');
    urls.add(url);
    return {
      ...p,
      tags: cleanTags(p.tags),
      note: String(p.note || ''),
      collection: String(p.collection || ''),
      type: ['web', 'pdf', 'youtube', 'note'].includes(p.type) ? p.type : 'web',
      bookmarked: Boolean(p.bookmarked),
      article: String(p.article || ''),
      text: String(p.text || ''),
      byline: String(p.byline || ''),
      summary: String(p.summary || ''),
      transcript: Array.isArray(p.transcript)
        ? p.transcript.map((line) => ({
            time: String(line.time || ''),
            text: String(line.text || ''),
          }))
        : [],
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
      updatedAt: Number(p.updatedAt) || Date.now(),
    };
  });
  const seenH = new Set();
  const highlights = data.highlights.map((h) => {
    if (
      !h ||
      typeof h.id !== 'string' ||
      seenH.has(h.id) ||
      !ids.has(h.pageId) ||
      typeof h.text !== 'string' ||
      typeof h.anchor !== 'object' ||
      !h.anchor
    )
      throw new Error('Invalid highlight');
    if (typeof h.anchor.exact !== 'string' || !h.anchor.exact)
      throw new Error('Invalid quote anchor');
    if (
      (h.originalText !== undefined &&
        (typeof h.originalText !== 'string' || h.originalText.length > 100000)) ||
      (h.repairHistory !== undefined &&
        (!Array.isArray(h.repairHistory) ||
          h.repairHistory.length > 10 ||
          h.repairHistory.some(
            (entry) =>
              !entry ||
              typeof entry.text !== 'string' ||
              entry.text.length > 100000 ||
              !entry.anchor ||
              typeof entry.anchor.exact !== 'string' ||
              !Number.isFinite(entry.repairedAt),
          )))
    )
      throw new Error('Invalid highlight repair history');
    if (
      h.anchor.quads !== undefined &&
      (!Array.isArray(h.anchor.quads) ||
        h.anchor.quads.some(
          (q) => !Array.isArray(q) || q.length !== 8 || q.some((v) => !Number.isFinite(v)),
        ))
    )
      throw new Error('Invalid PDF coordinates');
    seenH.add(h.id);
    return {
      ...h,
      anchor: {
        ...h.anchor,
        prefix: String(h.anchor.prefix || ''),
        suffix: String(h.anchor.suffix || ''),
      },
      color: color(h.color),
      tags: cleanTags(h.tags),
      note: String(h.note || ''),
      createdAt: Number.isFinite(h.createdAt) ? h.createdAt : Date.now(),
      updatedAt: Number.isFinite(h.updatedAt) ? h.updatedAt : Date.now(),
    };
  });
  const seenC = new Set();
  const cards = data.cards.map((c) => {
    if (
      !c ||
      typeof c.id !== 'string' ||
      seenC.has(c.id) ||
      !ids.has(c.pageId) ||
      typeof c.question !== 'string' ||
      typeof c.answer !== 'string'
    )
      throw new Error('Invalid flashcard');
    seenC.add(c.id);
    return { ...c, dueAt: Number(c.dueAt) || Date.now() };
  });
  const assets = (data.assets || []).map((a) => {
    if (
      !a ||
      typeof a.id !== 'string' ||
      !a.id ||
      !(a.type === 'application/pdf' ? ids.has(a.id) : ids.has(a.pageId) && isAudioType(a.type)) ||
      typeof a.base64 !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(a.base64)
    )
      throw new Error('Invalid PDF attachment');
    return a;
  });
  return { pages, highlights, cards, assets };
}
export function isAudioType(type) {
  return /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|flac)(;codecs=[\w., -]+)?$/i.test(String(type));
}
