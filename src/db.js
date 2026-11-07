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
import { mapReadingPositions, mergeReadingPositions, READING_LIMIT } from './reading-state.js';
import {
  PRESETS_KEY,
  normalizePresets,
  normalizePreset,
  collectionPath,
  collectionTarget,
  inCollection,
  collectionTree,
} from './organization.js';
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
function openDB() {
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
const TRANSLATION_CACHE_KEY = 'device-translation-cache';
export async function translationCache(key) {
  const entries = (await get('settings', TRANSLATION_CACHE_KEY))?.value || [];
  return entries.find((item) => item.key === key && item.expiresAt > Date.now())?.result;
}
export async function saveTranslationCache(key, result) {
  return transaction(['settings'], 'readwrite', async ({ settings }) => {
    const entries = (await request(settings.get(TRANSLATION_CACHE_KEY)))?.value || [];
    const now = Date.now();
    await request(
      settings.put({
        id: TRANSLATION_CACHE_KEY,
        value: [
          { key, result, expiresAt: now + 86400000 },
          ...entries.filter((item) => item.key !== key && item.expiresAt > now),
        ].slice(0, 64),
      }),
    );
  });
}
export function clearTranslationCache() {
  return deleteSetting(TRANSLATION_CACHE_KEY);
}
const READING_KEY = 'device-reading-progress';
const emptyReadingProgress = () => ({ entries: [], collapsed: false });
export async function readingProgress() {
  return (await get('settings', READING_KEY))?.value || emptyReadingProgress();
}
export async function saveReadingProgress(change) {
  return transaction(['settings', 'pages'], 'readwrite', async ({ settings, pages }) => {
    const value = (await request(settings.get(READING_KEY)))?.value || emptyReadingProgress();
    if ('collapsed' in change) value.collapsed = Boolean(change.collapsed);
    else {
      const page = await request(pages.get(change.id));
      if (!page || !Number.isFinite(change.position)) return;
      const kind = page.type === 'pdf' ? 'pdf' : 'reader';
      if (kind !== change.kind) return;
      const position =
        kind === 'pdf'
          ? Math.max(1, Math.floor(change.position))
          : Math.max(0, Math.min(1, change.position));
      const previous = value.entries.find((entry) => entry.id === change.id);
      if (previous?.position === position && previous.kind === kind) return false;
      value.entries = [
        {
          id: change.id,
          kind,
          position,
          updatedAt: Math.max(Date.now(), (previous?.updatedAt || 0) + 1),
        },
        ...value.entries.filter((entry) => entry.id !== change.id),
      ].slice(0, READING_LIMIT);
    }
    await request(settings.put({ id: READING_KEY, value }));
    return true;
  });
}
export async function preferences() {
  return { ...DEFAULT_SETTINGS, ...(await get('settings', 'main'))?.value };
}
export const put = (name, item) =>
  transaction([name], 'readwrite', (s) => request(s[name].put(item))).then(() => item);
export const deleteSetting = (id) =>
  transaction(['settings'], 'readwrite', (s) => request(s.settings.delete(id)));
export async function snapshot() {
  return transaction(['pages', 'highlights', 'cards', 'settings'], 'readonly', async (s) => {
    const [pages, highlights, cards, settings, presets] = await Promise.all([
      ...['pages', 'highlights', 'cards'].map((n) => request(s[n].getAll())),
      request(s.settings.get('main')),
      request(s.settings.get(PRESETS_KEY)),
    ]);
    return {
      pages,
      highlights,
      cards,
      settings: { ...DEFAULT_SETTINGS, ...settings?.value },
      exportPresets: normalizePresets(presets?.value || []),
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
      exportPresets: normalizePresets((await request(s.settings.get(PRESETS_KEY)))?.value || []),
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
async function savePageRecord(store, input) {
  const url = canonicalUrl(input.url);
  const now = Date.now();
  const old = await request(store.index('url').get(url));
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
  if (input.collection !== undefined) page.collection = collectionTarget(input.collection);
  if (page.type === 'note' && input.note !== undefined) page.text = String(input.note);
  page.updatedAt = now;
  await request(store.put(page));
  return page;
}
export function savePage(input) {
  return transaction(['pages'], 'readwrite', ({ pages }) => savePageRecord(pages, input));
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
  const { _deletedCards = [], ...highlight } = item;
  return transaction(['pages', 'highlights', 'cards'], 'readwrite', async (s) => {
    if (!(await request(s.pages.get(highlight.pageId)))) throw new Error('Page no longer exists');
    if (await request(s.highlights.get(highlight.id)))
      throw new Error('This highlight is already in the library');
    if (
      _deletedCards.some(
        (card) => card.pageId !== highlight.pageId || card.highlightId !== highlight.id,
      )
    )
      throw new Error('A study card belongs to another highlight');
    await request(s.highlights.add(highlight));
    for (const card of _deletedCards) await request(s.cards.add(card));
    return highlight;
  });
}
export async function saveSettings(patch) {
  return transaction(['settings'], 'readwrite', async ({ settings }) => {
    const old = (await request(settings.get('main')))?.value;
    const next = normalizeSettings(patch, old);
    await request(settings.put({ id: 'main', value: next }));
    return next;
  });
}
function normalizeSettings(patch, old = DEFAULT_SETTINGS) {
  const next = { ...DEFAULT_SETTINGS, ...old };
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
  return transaction(stores, 'readwrite', async (s) => {
    let readingChanged = false;
    if (journal.readingPositions) {
      const current = (await request(s.settings.get(READING_KEY)))?.value || emptyReadingProgress();
      const local = mapReadingPositions(
        mapReadingPositions(current.entries, validated.pages, true),
        validated.pages,
      );
      const remote = mapReadingPositions(journal.readingPositions, validated.pages);
      const entries = mergeReadingPositions(local, remote);
      readingChanged = JSON.stringify(entries) !== JSON.stringify(current.entries);
      if (readingChanged)
        await request(s.settings.put({ id: READING_KEY, value: { ...current, entries } }));
    }
    for (const name of ['pages', 'highlights', 'cards', 'assets']) {
      await request(s[name].clear());
      for (const item of validated[name]) await request(s[name].put(item));
    }
    await request(s.settings.put({ id: 'main', value: settings }));
    await request(s.settings.put({ id: 'drive-journal', value: journal }));
    return readingChanged;
  });
}

export async function saveExportPreset(input) {
  const preset = normalizePreset(input);
  return transaction(['settings'], 'readwrite', async (s) => {
    const presets = normalizePresets((await request(s.settings.get(PRESETS_KEY)))?.value || []);
    const next = presets.filter((item) => item.id !== preset.id);
    if (next.some((item) => item.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase()))
      throw new Error('Choose a different preset name.');
    next.push(preset);
    normalizePresets(next);
    await request(s.settings.put({ id: PRESETS_KEY, value: next }));
    return preset;
  });
}
export async function deleteExportPreset(id) {
  return transaction(['settings'], 'readwrite', async (s) => {
    const presets = normalizePresets((await request(s.settings.get(PRESETS_KEY)))?.value || []);
    await request(
      s.settings.put({ id: PRESETS_KEY, value: presets.filter((item) => item.id !== id) }),
    );
  });
}
export async function organizeCollection({ from, to, remove = false }) {
  from = collectionPath(from);
  to = remove ? '' : collectionTarget(to, false);
  if (!from) throw new Error('Choose a collection to organize.');
  if (!remove && (from === to || inCollection(to, from)))
    throw new Error('Choose a different destination outside this collection.');
  return transaction(['pages', 'settings'], 'readwrite', async (s) => {
    const pages = await request(s.pages.getAll());
    const affected = pages.filter((page) => inCollection(page.collection, from));
    if (!affected.length)
      throw new Error('This collection is empty or was moved. Refresh your library.');
    if (
      !remove &&
      collectionTree(pages).some((node) => node.path === to && !inCollection(node.path, from))
    )
      throw new Error(
        'That destination already exists. Choose another name to avoid merging collections.',
      );
    const undo = { pages: [], presets: [] };
    for (const page of affected) {
      const next = remove
        ? ''
        : collectionTarget(to + collectionPath(page.collection).slice(from.length), false);
      undo.pages.push({ id: page.id, before: page.collection || '', after: next });
      await request(
        s.pages.put({
          ...page,
          collection: next,
          updatedAt: Math.max(Date.now(), page.updatedAt + 1),
        }),
      );
    }
    if (!remove) {
      const presets = normalizePresets((await request(s.settings.get(PRESETS_KEY)))?.value || []);
      for (const preset of presets)
        if (preset.scope === 'collection' && inCollection(preset.collection, from)) {
          const next = collectionTarget(to + preset.collection.slice(from.length), false);
          undo.presets.push({ id: preset.id, before: preset.collection, after: next });
          preset.collection = next;
        }
      await request(s.settings.put({ id: PRESETS_KEY, value: presets }));
    }
    return { count: affected.length, undo };
  });
}
export async function movePagesToCollection({ ids, collection }) {
  collection = collectionTarget(collection);
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 10000 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string')
  )
    throw new Error('Select between 1 and 10,000 distinct sources.');
  return transaction(['pages'], 'readwrite', async (s) => {
    const pages = [];
    for (const id of ids) {
      const page = await request(s.pages.get(id));
      if (!page) throw new Error('A selected source was deleted. Nothing was moved.');
      pages.push(page);
    }
    const undo = { pages: [], presets: [] };
    for (const page of pages)
      if (page.collection !== collection) {
        undo.pages.push({ id: page.id, before: page.collection || '', after: collection });
        await request(
          s.pages.put({ ...page, collection, updatedAt: Math.max(Date.now(), page.updatedAt + 1) }),
        );
      }
    return { count: undo.pages.length, undo };
  });
}
export async function undoOrganization({ pages, presets = [] }) {
  if (
    !Array.isArray(pages) ||
    !pages.length ||
    pages.length > 10000 ||
    new Set(pages.map((item) => item?.id)).size !== pages.length ||
    pages.some(
      (item) =>
        !item ||
        typeof item.id !== 'string' ||
        typeof item.before !== 'string' ||
        typeof item.after !== 'string',
    ) ||
    !Array.isArray(presets) ||
    presets.length > 20 ||
    presets.some(
      (item) =>
        !item ||
        typeof item.id !== 'string' ||
        typeof item.before !== 'string' ||
        typeof item.after !== 'string',
    )
  )
    throw new Error('This organization change cannot be undone.');
  return transaction(['pages', 'settings'], 'readwrite', async (s) => {
    const records = [];
    for (const item of pages) {
      const page = await request(s.pages.get(item.id));
      if (!page || page.collection !== item.after)
        throw new Error('Some sources were moved or deleted afterward. No changes were undone.');
      records.push({ page, item });
    }
    for (const { page, item } of records)
      await request(
        s.pages.put({
          ...page,
          collection: item.before,
          updatedAt: Math.max(Date.now(), page.updatedAt + 1),
        }),
      );
    const saved = normalizePresets((await request(s.settings.get(PRESETS_KEY)))?.value || []);
    for (const item of presets) {
      const preset = saved.find((preset) => preset.id === item.id);
      if (preset?.scope === 'collection' && preset.collection === item.after)
        preset.collection = collectionTarget(item.before, false);
    }
    await request(s.settings.put({ id: PRESETS_KEY, value: saved }));
    return { count: records.length };
  });
}
export async function savePDF({ url, title, base64 }) {
  if (
    typeof base64 !== 'string' ||
    base64.length > 70 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw new Error('Invalid PDF data');
  return transaction(['pages', 'assets'], 'readwrite', async ({ pages, assets }) => {
    const page = await savePageRecord(pages, { url, title, type: 'pdf' });
    await request(assets.put({ id: page.id, type: 'application/pdf', base64 }));
    return page;
  });
}
export async function addCard(input) {
  if (!String(input.question || '').trim() || !String(input.answer || '').trim())
    throw new Error('Add a question and answer');
  return transaction(['pages', 'highlights', 'cards'], 'readwrite', async (s) => {
    if (!(await request(s.pages.get(input.pageId)))) throw new Error('Page no longer exists');
    if (input.highlightId) {
      const highlight = await request(s.highlights.get(input.highlightId));
      if (!highlight || highlight.pageId !== input.pageId)
        throw new Error('The source highlight no longer exists on this page');
    }
    const card = {
      id: uid(),
      pageId: input.pageId,
      highlightId: input.highlightId || '',
      question: String(input.question),
      answer: String(input.answer),
      dueAt: Date.now(),
      createdAt: Date.now(),
      interval: 0,
      repetitions: 0,
    };
    await request(s.cards.put(card));
    return card;
  });
}
export async function gradeCard(id, correct) {
  return transaction(['cards'], 'readwrite', async ({ cards }) => {
    const card = await request(cards.get(id));
    if (!card) throw new Error('Card no longer exists');
    const next = reviewCard(card, correct);
    await request(cards.put(next));
    return next;
  });
}
export const deleteCard = (id) =>
  transaction(['cards'], 'readwrite', (s) => request(s.cards.delete(id)));
export async function importBackup(data, { preview = false, expected } = {}) {
  const validated = validateBackup(data);
  const incomingPresets = normalizePresets(data.exportPresets || []);
  // Preview and restore share the same decisions. A changed report aborts the write transaction.
  return transaction(stores, preview ? 'readonly' : 'readwrite', async (s) => {
    const report = {
      sources: { added: 0, merged: 0 },
      highlights: { added: 0, skipped: 0 },
      cards: { added: 0, skipped: 0 },
      attachments: { added: 0, skipped: 0 },
      presets: { added: 0, skipped: 0 },
      attention: { total: 0, examples: [] },
    };
    const note = (message) => {
      report.attention.total++;
      if (report.attention.examples.length < 8) report.attention.examples.push(message);
    };
    const write = (store, item) => (preview ? undefined : request(store.put(item)));
    const presets = normalizePresets((await request(s.settings.get(PRESETS_KEY)))?.value || []);
    for (const preset of incomingPresets) {
      if (
        presets.some(
          (item) =>
            item.id === preset.id ||
            JSON.stringify({ ...item, id: '' }) === JSON.stringify({ ...preset, id: '' }),
        )
      ) {
        report.presets.skipped++;
        continue;
      }
      let name = preset.name;
      let index = 1;
      while (presets.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
        name = preset.name.slice(0, 60) + ' (imported ' + index++ + ')';
      if (name !== preset.name) note('Renamed export preset: ' + name);
      presets.push({ ...preset, name });
      report.presets.added++;
    }
    normalizePresets(presets);
    if (report.presets.added) await write(s.settings, { id: PRESETS_KEY, value: presets });

    const localPages = new Map((await request(s.pages.getAll())).map((page) => [page.url, page]));
    const map = new Map();
    const titles = new Map(validated.pages.map((page) => [page.id, page.title.slice(0, 160)]));
    const highlightKey = (h, pageId = h.pageId) =>
      JSON.stringify([pageId, h.text, anchorKey(h.anchor), h.note, h.color, h.tags]);
    const highlights = new Map(
      (await request(s.highlights.getAll())).map((item) => [highlightKey(item), item.id]),
    );
    const highlightMap = new Map();
    const cardKey = (c, pageId = c.pageId) => JSON.stringify([pageId, c.question, c.answer]);
    const cards = new Set((await request(s.cards.getAll())).map((item) => cardKey(item)));
    for (const p of validated.pages) {
      const url = canonicalUrl(p.url);
      const existing = localPages.get(url);
      const id = existing?.id || uid();
      map.set(p.id, id);
      if (!existing) {
        await write(s.pages, { ...p, id, url });
        report.sources.added++;
        continue;
      }
      report.sources.merged++;
      if (
        ['title', 'note', 'text', 'article', 'summary', 'collection', 'bookmarked', 'type'].some(
          (key) => (existing[key] ?? '') !== (p[key] ?? ''),
        ) ||
        JSON.stringify(existing.tags) !== JSON.stringify(p.tags)
      )
        note('Kept local source details: ' + titles.get(p.id));
    }
    for (const h of validated.highlights) {
      const pageId = map.get(h.pageId);
      const key = highlightKey(h, pageId);
      const duplicate = highlights.get(key);
      const id = duplicate || uid();
      highlightMap.set(h.id, id);
      if (duplicate) report.highlights.skipped++;
      else {
        highlights.set(key, id);
        await write(s.highlights, { ...h, id, pageId });
        report.highlights.added++;
      }
    }
    for (const c of validated.cards) {
      const pageId = map.get(c.pageId);
      const key = cardKey(c, pageId);
      if (cards.has(key)) report.cards.skipped++;
      else {
        cards.add(key);
        await write(s.cards, {
          ...c,
          id: uid(),
          highlightId: highlightMap.get(c.highlightId) || '',
          pageId,
        });
        report.cards.added++;
      }
    }
    const pdfByPage = new Map();
    const audioByPage = new Map();
    for (const a of validated.assets) {
      if (a.type === 'application/pdf') {
        const id = map.get(a.id);
        const existing = pdfByPage.get(id) || (await request(s.assets.get(id)));
        if (existing) {
          report.attachments.skipped++;
          if (existing.base64 !== a.base64) note('Kept local PDF: ' + titles.get(a.id));
        } else {
          const item = { ...a, id };
          pdfByPage.set(id, item);
          await write(s.assets, item);
          report.attachments.added++;
        }
      } else {
        const pageId = map.get(a.pageId);
        if (!audioByPage.has(pageId))
          audioByPage.set(pageId, await request(s.assets.index('pageId').getAll(pageId)));
        const existing = audioByPage.get(pageId);
        const sourceId = a.sourceId || a.id;
        if (
          existing.some(
            (x) => (x.sourceId || x.id) === sourceId && x.base64 === a.base64 && x.type === a.type,
          )
        ) {
          report.attachments.skipped++;
        } else {
          const item = {
            ...a,
            sourceId,
            id: 'audio:' + uid(),
            pageId,
            highlightId: highlightMap.get(a.highlightId) || '',
          };
          existing.push(item);
          await write(s.assets, item);
          report.attachments.added++;
        }
      }
    }
    if (expected && JSON.stringify(expected) !== JSON.stringify(report))
      throw new Error(
        'The library changed since this preview. Open the backup again to review the new result.',
      );
    return { pages: validated.pages.length, highlights: validated.highlights.length, report };
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
