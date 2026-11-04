import {
  DEFAULT_SETTINGS,
  canonicalUrl,
  uid,
  cleanTags,
  color,
  reviewCard,
  validateBackup,
  VERSION,
} from './core.js';
import { languageCode } from './languages.js';
import { EXPERIENCE_KEY, experienceState } from './experience.js';
const stores = ['pages', 'highlights', 'cards', 'settings', 'assets'];
const anchorKey = (a) =>
  JSON.stringify([
    a.exact,
    a.start,
    a.end,
    a.prefix || '',
    a.suffix || '',
    a.page || 0,
    a.quads || [],
  ]);
let opened;
export function openDB() {
  return (opened ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('margin-local', 2);
    req.onupgradeneeded = () => {
      for (const name of stores) {
        if (req.result.objectStoreNames.contains(name)) continue;
        const s = req.result.createObjectStore(name, { keyPath: 'id' });
        if (name === 'pages') s.createIndex('url', 'url', { unique: true });
        if (name === 'highlights' || name === 'cards') s.createIndex('pageId', 'pageId');
      }
      const assets = req.transaction.objectStore('assets');
      if (!assets.indexNames.contains('pageId')) assets.createIndex('pageId', 'pageId');
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        opened = undefined;
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  }));
}
const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
export async function transaction(names, mode, fn) {
  const db = await openDB();
  const tx = db.transaction(names, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('Database transaction cancelled'));
    tx.onerror = () => {};
  });
  try {
    const result = await fn(Object.fromEntries(names.map((n) => [n, tx.objectStore(n)])));
    await done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await done.catch(() => {});
    throw error;
  }
}
export const all = (name) => transaction([name], 'readonly', (s) => request(s[name].getAll()));
export const get = (name, id) => transaction([name], 'readonly', (s) => request(s[name].get(id)));
export async function preferences() {
  return { ...DEFAULT_SETTINGS, ...(await get('settings', 'main'))?.value };
}
export const put = (name, item) =>
  transaction([name], 'readwrite', (s) => request(s[name].put(item))).then(() => item);
export const deleteSetting = (id) =>
  transaction(['settings'], 'readwrite', (s) => request(s.settings.delete(id)));
export async function snapshot() {
  return transaction(['pages', 'highlights', 'cards', 'settings'], 'readonly', async (s) => {
    const [pages, highlights, cards, settings] = await Promise.all([
      ...['pages', 'highlights', 'cards'].map((n) => request(s[n].getAll())),
      request(s.settings.get('main')),
    ]);
    return {
      pages,
      highlights,
      cards,
      settings: { ...DEFAULT_SETTINGS, ...settings?.value },
    };
  });
}
export async function backupSnapshot() {
  return transaction(stores, 'readonly', async (s) => {
    const [pages, highlights, cards, settings, assets] = await Promise.all(
      stores.map((name) =>
        request(name === 'settings' ? s.settings.get('main') : s[name].getAll()),
      ),
    );
    return {
      format: 'margin-backup',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      pages,
      highlights,
      cards,
      assets,
      settings: { ...DEFAULT_SETTINGS, ...settings?.value },
    };
  });
}
export async function pageData(url) {
  return transaction(['pages', 'highlights', 'settings'], 'readonly', async (s) => {
    const page = await request(s.pages.index('url').get(canonicalUrl(url)));
    const highlights = page ? await request(s.highlights.index('pageId').getAll(page.id)) : [];
    const settings = await request(s.settings.get('main'));
    return { page, highlights, settings: { ...DEFAULT_SETTINGS, ...settings?.value } };
  });
}
export async function savePage(input) {
  const url = canonicalUrl(input.url);
  const now = Date.now();
  return transaction(['pages'], 'readwrite', async (s) => {
    const old = await request(s.pages.index('url').get(url));
    const page = {
      id: old?.id || uid(),
      url,
      title: String(input.title || url).slice(0, 2000),
      type: input.type || old?.type || 'web',
      createdAt: old?.createdAt || now,
      updatedAt: now,
      tags: [],
      note: '',
      collection: '',
      bookmarked: false,
      ...old,
    };
    for (const key of [
      'title',
      'note',
      'collection',
      'bookmarked',
      'article',
      'text',
      'byline',
      'summary',
      'type',
      'transcript',
    ])
      if (input[key] !== undefined) page[key] = input[key];
    page.tags = input.tags !== undefined ? cleanTags(input.tags) : page.tags;
    if (page.type === 'note' && input.note !== undefined) page.text = String(input.note);
    page.updatedAt = now;
    await request(s.pages.put(page));
    return page;
  });
}
export async function addHighlight(input) {
  if (!input.text?.trim() || input.text.length > 100000 || !input.anchor)
    throw new Error('Select text before highlighting');
  return transaction(['highlights', 'pages'], 'readwrite', async (s) => {
    const page = await request(s.pages.get(input.pageId));
    if (!page) throw new Error('Page no longer exists');
    const item = {
      id: uid(),
      pageId: page.id,
      text: input.text,
      anchor: input.anchor,
      color: color(input.color),
      note: String(input.note || ''),
      tags: cleanTags(input.tags),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await request(s.highlights.put(item));
    await request(s.pages.put({ ...page, updatedAt: Date.now() }));
    return item;
  });
}
export async function updateHighlight(id, patch) {
  return transaction(['highlights', 'pages'], 'readwrite', async (s) => {
    const old = await request(s.highlights.get(id));
    if (!old) throw new Error('Highlight no longer exists');
    const next = { ...old, updatedAt: Math.max(Date.now(), old.updatedAt + 1) };
    if (patch.color !== undefined) next.color = color(patch.color);
    if (patch.note !== undefined) next.note = String(patch.note);
    if (patch.tags !== undefined) next.tags = cleanTags(patch.tags);
    await request(s.highlights.put(next));
    const page = await request(s.pages.get(old.pageId));
    if (page) await request(s.pages.put({ ...page, updatedAt: Date.now() }));
    return next;
  });
}
export async function repairHighlight(id, { text, anchor, expectedUpdatedAt }) {
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > 100000 ||
    !anchor ||
    anchor.exact !== text ||
    !Number.isInteger(anchor.start) ||
    !Number.isInteger(anchor.end) ||
    anchor.start < 0 ||
    anchor.end <= anchor.start ||
    anchor.end - anchor.start !== text.length ||
    typeof anchor.prefix !== 'string' ||
    typeof anchor.suffix !== 'string'
  )
    throw new Error('Select a replacement passage before saving its location.');
  return transaction(['highlights', 'pages'], 'readwrite', async (s) => {
    const old = await request(s.highlights.get(id));
    if (!old) throw new Error('This highlight was deleted. Your selection has not been saved.');
    if (old.updatedAt !== expectedUpdatedAt)
      throw new Error(
        'This highlight changed in another tab or device. Cancel and start repair again.',
      );
    const page = await request(s.pages.get(old.pageId));
    if (!page) throw new Error('This source was deleted.');
    if (page.type === 'pdf')
      throw new Error('Location repair currently supports website and saved-article highlights.');
    const now = Math.max(Date.now(), old.updatedAt + 1);
    const next = {
      ...old,
      text,
      anchor: {
        exact: text,
        start: anchor.start,
        end: anchor.end,
        prefix: anchor.prefix.slice(-256),
        suffix: anchor.suffix.slice(0, 256),
      },
      originalText: old.originalText || old.text,
      repairHistory: [
        ...(old.repairHistory || []),
        { text: old.text, anchor: old.anchor, repairedAt: now },
      ].slice(-10),
      updatedAt: now,
    };
    await request(s.highlights.put(next));
    await request(s.pages.put({ ...page, updatedAt: now }));
    return next;
  });
}
export async function deviceExperience(patch) {
  return transaction(['settings', 'pages'], 'readwrite', async (s) => {
    const stored = await request(s.settings.get(EXPERIENCE_KEY));
    const state = experienceState(stored?.value);
    // Existing libraries upgrading from older releases need an initial reminder
    // baseline even if no new editing takes place after the update.
    if (!stored && (await request(s.pages.count())) > 0) {
      state.changes = 1;
      state.firstChangeAt = Date.now();
      await request(s.settings.put({ id: EXPERIENCE_KEY, value: state }));
    }
    if (patch) {
      // A whitelist prevents imported preferences or arbitrary UI patches from changing counters.
      for (const key of ['enabled', 'intervalDays', 'changeThreshold', 'guideHidden', 'searched'])
        if (patch[key] !== undefined) state[key] = patch[key];
      if (patch.snooze) state.snoozedUntil = Date.now() + 7 * 86400000;
      const normalized = experienceState(state);
      await request(s.settings.put({ id: EXPERIENCE_KEY, value: normalized }));
      return normalized;
    }
    return state;
  });
}
export async function recordResearchChange() {
  return transaction(['settings'], 'readwrite', async (s) => {
    const state = experienceState((await request(s.settings.get(EXPERIENCE_KEY)))?.value);
    state.changes++;
    state.firstChangeAt ||= Date.now();
    await request(s.settings.put({ id: EXPERIENCE_KEY, value: state }));
  });
}
export async function recordBackupDownload(revision) {
  return transaction(['settings'], 'readwrite', async (s) => {
    const state = experienceState((await request(s.settings.get(EXPERIENCE_KEY)))?.value);
    if (!Number.isInteger(revision) || revision < 0 || revision > state.changes)
      throw new Error('Invalid backup revision. Download a new backup.');
    state.backedUpChanges = Math.max(state.backedUpChanges, revision);
    state.lastBackupAt = Date.now();
    state.snoozedUntil = 0;
    await request(s.settings.put({ id: EXPERIENCE_KEY, value: state }));
    return state;
  });
}
export async function removePage(id) {
  return transaction(['pages', 'highlights', 'cards', 'assets'], 'readwrite', async (s) => {
    await request(s.pages.delete(id));
    await request(s.assets.delete(id));
    for (const key of await request(s.assets.index('pageId').getAllKeys(id)))
      await request(s.assets.delete(key));
    for (const name of ['highlights', 'cards'])
      for (const key of await request(s[name].index('pageId').getAllKeys(id)))
        await request(s[name].delete(key));
  });
}
export async function removeHighlight(id) {
  return transaction(['highlights', 'cards'], 'readwrite', async (s) => {
    const item = await request(s.highlights.get(id));
    if (item) await request(s.highlights.delete(id));
    const cards = (await request(s.cards.getAll())).filter((card) => card.highlightId === id);
    for (const card of cards) await request(s.cards.delete(card.id));
    return item ? { ...item, _deletedCards: cards } : item;
  });
}
export async function restoreHighlight(item) {
  if (!(await get('pages', item.pageId))) throw new Error('Page no longer exists');
  const { _deletedCards = [], ...highlight } = item;
  await transaction(['highlights', 'cards'], 'readwrite', async (s) => {
    await request(s.highlights.put(highlight));
    for (const card of _deletedCards) await request(s.cards.put(card));
  });
  return highlight;
}
export async function saveSettings(patch) {
  const old = (await get('settings', 'main'))?.value || DEFAULT_SETTINGS;
  const next = normalizeSettings(patch, old);
  await put('settings', { id: 'main', value: next });
  return next;
}
export function normalizeSettings(patch, old = DEFAULT_SETTINGS) {
  const next = { ...old };
  for (const key of Object.keys(DEFAULT_SETTINGS))
    if (patch[key] !== undefined) next[key] = patch[key];
  if (!['grid', 'list'].includes(next.libraryLayout)) next.libraryLayout = 'grid';
  next.translationTarget = languageCode(next.translationTarget || 'fa');
  next.voiceLanguage = languageCode(next.voiceLanguage || 'en-US');
  next.detailWidth = Math.min(720, Math.max(360, Number(next.detailWidth) || 480));
  next.colors = next.colors.slice(0, 12).map(color);
  if (!next.colors.length) throw new Error('Keep at least one color');
  next.color = color(next.color);
  if (!['light', 'dark', 'sepia', 'contrast', 'auto'].includes(next.theme)) next.theme = 'light';
  next.readerSize = Math.min(36, Math.max(14, Number(next.readerSize) || 20));
  next.readerWidth = Math.min(1100, Math.max(440, Number(next.readerWidth) || 740));
  next.readerLine = Math.min(2.5, Math.max(1.2, Number(next.readerLine) || 1.85));
  next.disabledSites = (Array.isArray(next.disabledSites) ? next.disabledSites : []).map(String);
  return next;
}

// Background sync serializes this transaction with user mutations. Journal and data commit together.
export async function applySyncedBackup(backup, journal) {
  const validated = validateBackup(backup),
    settings = normalizeSettings(backup.settings);
  await transaction(stores, 'readwrite', async (s) => {
    for (const name of ['pages', 'highlights', 'cards', 'assets']) {
      await request(s[name].clear());
      for (const item of validated[name]) await request(s[name].put(item));
    }
    await request(s.settings.put({ id: 'main', value: settings }));
    await request(s.settings.put({ id: 'drive-journal', value: journal }));
  });
}

export async function savePDF({ url, title, base64 }) {
  if (
    typeof base64 !== 'string' ||
    base64.length > 70 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw new Error('Invalid PDF data');
  const page = await savePage({ url, title, type: 'pdf' });
  await put('assets', { id: page.id, type: 'application/pdf', base64 });
  return page;
}
export async function addCard(input) {
  if (!String(input.question || '').trim() || !String(input.answer || '').trim())
    throw new Error('Add a question and answer');
  if (!(await get('pages', input.pageId))) throw new Error('Page no longer exists');
  return put('cards', {
    id: uid(),
    pageId: input.pageId,
    highlightId: input.highlightId || '',
    question: String(input.question),
    answer: String(input.answer),
    dueAt: Date.now(),
    createdAt: Date.now(),
    interval: 0,
    repetitions: 0,
  });
}
export async function gradeCard(id, correct) {
  const card = await get('cards', id);
  if (!card) throw new Error('Card no longer exists');
  return put('cards', reviewCard(card, correct));
}
export const deleteCard = (id) =>
  transaction(['cards'], 'readwrite', (s) => request(s.cards.delete(id)));
export async function importBackup(data) {
  const validated = validateBackup(data);
  // Merge by canonical page URL; new IDs prevent imported records overwriting unrelated local data.
  return transaction(stores, 'readwrite', async (s) => {
    const localPages = await request(s.pages.getAll());
    const map = new Map();
    const localHighlights = await request(s.highlights.getAll());
    const highlightMap = new Map();
    const localCards = await request(s.cards.getAll());
    for (const p of validated.pages) {
      const existing = localPages.find((x) => x.url === canonicalUrl(p.url));
      const id = existing?.id || uid();
      map.set(p.id, id);
      if (!existing) await request(s.pages.put({ ...p, id, url: canonicalUrl(p.url) }));
    }
    for (const h of validated.highlights) {
      const pageId = map.get(h.pageId);
      const duplicate = localHighlights.find(
        (x) =>
          x.pageId === pageId &&
          x.text === h.text &&
          anchorKey(x.anchor) === anchorKey(h.anchor) &&
          x.note === h.note &&
          x.color === h.color &&
          JSON.stringify(x.tags) === JSON.stringify(h.tags),
      );
      const id = duplicate?.id || uid();
      highlightMap.set(h.id, id);
      if (!duplicate) await request(s.highlights.put({ ...h, id, pageId }));
    }
    for (const c of validated.cards) {
      const pageId = map.get(c.pageId);
      if (
        !localCards.some(
          (x) => x.pageId === pageId && x.question === c.question && x.answer === c.answer,
        )
      )
        await request(
          s.cards.put({
            ...c,
            id: uid(),
            highlightId: highlightMap.get(c.highlightId) || '',
            pageId,
          }),
        );
    }
    for (const a of validated.assets) {
      if (a.type === 'application/pdf') {
        const id = map.get(a.id);
        if (!(await request(s.assets.get(id)))) await request(s.assets.put({ ...a, id }));
      } else {
        const pageId = map.get(a.pageId);
        const existing = await request(s.assets.index('pageId').getAll(pageId));
        if (
          !existing.some(
            (x) =>
              (x.sourceId || x.id) === (a.sourceId || a.id) &&
              x.base64 === a.base64 &&
              x.type === a.type,
          )
        )
          await request(
            s.assets.put({
              ...a,
              sourceId: a.sourceId || a.id,
              id: 'audio:' + uid(),
              pageId,
              highlightId: highlightMap.get(a.highlightId) || '',
            }),
          );
      }
    }
    return { pages: validated.pages.length, highlights: validated.highlights.length };
  });
}
export async function audioNotes(pageId) {
  return transaction(['assets'], 'readonly', (s) =>
    request(s.assets.index('pageId').getAll(pageId)),
  );
}
export async function saveAudioNote(item) {
  return transaction(['pages', 'assets'], 'readwrite', async (s) => {
    const page = await request(s.pages.get(item.pageId));
    if (!page) throw new Error('Save the page before attaching audio.');
    await request(s.assets.put(item));
    await request(s.pages.put({ ...page, updatedAt: Date.now() }));
    return item;
  });
}
export const deleteAudioNote = (id) =>
  transaction(['assets'], 'readwrite', (s) => request(s.assets.delete(id)));
export async function appendNote({ pageId, text, highlightId = '' }) {
  if (!String(text || '').trim()) return;
  return transaction(['pages', 'highlights'], 'readwrite', async (s) => {
    const page = await request(s.pages.get(pageId));
    if (!page) throw new Error('This page was deleted.');
    const target = highlightId ? await request(s.highlights.get(highlightId)) : page;
    if (!target || (highlightId && target.pageId !== pageId))
      throw new Error('This highlight was deleted.');
    target.note = (target.note ? target.note + '\n\n' : '') + String(text);
    target.updatedAt = Math.max(Date.now(), target.updatedAt + 1);
    if (highlightId) await request(s.pages.put({ ...page, updatedAt: target.updatedAt }));
    if (!highlightId && page.type === 'note') target.text = target.note;
    await request(s[highlightId ? 'highlights' : 'pages'].put(target));
    return target;
  });
}
