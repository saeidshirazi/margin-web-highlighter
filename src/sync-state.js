import { canonicalUrl, DEFAULT_SETTINGS, VERSION, validateBackup } from './core.js';

export const SYNC_FORMAT = 'margin-drive-sync';
const groups = ['pages', 'highlights', 'cards', 'assets'];
const keyFor = (store, id) => JSON.stringify([store, id]);
const validDevice = (value) =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9][\w-]{0,99}$/.test(value) &&
  !['constructor', 'prototype'].includes(value);
export const stableJSON = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sort(value[key])]),
    );
  return value;
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJSON(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function emptyState(device = crypto.randomUUID()) {
  return { format: SYNC_FORMAT, version: 1, device, counter: 0, entries: {}, conflicts: {} };
}
// Page URLs are wire identities. Each installation keeps its original local page IDs.
export function wireRecords(backup) {
  const validated = validateBackup(backup);
  const urls = new Map(backup.pages.map((page) => [page.id, canonicalUrl(page.url)]));
  const records = new Map();
  for (const store of groups) {
    for (const original of validated[store] || []) {
      let value = { ...original };
      if (store === 'pages') value = { ...value, id: urls.get(value.id), url: urls.get(value.id) };
      else if (store === 'assets' && value.type === 'application/pdf')
        value.id = urls.get(value.id);
      else value.pageId = urls.get(value.pageId);
      if (
        !value.id ||
        (store !== 'pages' &&
          !(store === 'assets' && value.type === 'application/pdf') &&
          !value.pageId)
      )
        throw new Error(
          'A saved attachment or annotation has no source. Export a backup before syncing.',
        );
      records.set(keyFor(store, value.id), value);
    }
  }
  for (const name of Object.keys(DEFAULT_SETTINGS))
    records.set(keyFor('settings', name), backup.settings[name] ?? DEFAULT_SETTINGS[name]);
  return records;
}
export async function captureState(backup, previous = emptyState()) {
  const next = structuredClone(previous),
    records = wireRecords(backup);
  // Orphans remain recoverable in the journal when a parent was deleted on another device.
  for (const [key, entry] of Object.entries(previous.entries)) {
    if (records.has(key) || entry.deleted) continue;
    const [store] = JSON.parse(key);
    const parent = entry.value?.pageId;
    if (store !== 'pages' && parent && previous.entries[keyFor('pages', parent)]?.deleted) continue;
    next.counter++;
    next.entries[key] = {
      deleted: true,
      hash: '',
      clock: { ...entry.clock, [next.device]: next.counter },
      stamp: [next.counter, next.device],
    };
  }
  for (const [key, value] of records) {
    const hash = await digest(value),
      old = next.entries[key];
    const [store, id] = JSON.parse(key);
    if (!old && store === 'settings' && stableJSON(value) === stableJSON(DEFAULT_SETTINGS[id]))
      continue;
    if (old && !old.deleted && old.hash === hash) continue;
    next.counter++;
    next.entries[key] = {
      value,
      hash,
      deleted: false,
      clock: { ...old?.clock, [next.device]: next.counter },
      stamp: [next.counter, next.device],
    };
  }
  return next;
}
function dominates(a, b) {
  return Object.entries(b.clock).every(([device, counter]) => (a.clock[device] || 0) >= counter);
}
function compare(a, b) {
  return a.stamp[0] - b.stamp[0] || a.stamp[1].localeCompare(b.stamp[1], 'en');
}
export function mergeStates(local, ...remotes) {
  const merged = structuredClone(local);
  for (const remote of remotes) {
    merged.counter = Math.max(merged.counter, remote.counter);
    merged.conflicts = { ...merged.conflicts, ...remote.conflicts };
    for (const [key, incoming] of Object.entries(remote.entries)) {
      const old = merged.entries[key];
      if (!old) {
        merged.entries[key] = structuredClone(incoming);
        continue;
      }
      const oldKnows = dominates(old, incoming),
        newKnows = dominates(incoming, old);
      if (oldKnows && !newKnows) continue;
      if (newKnows && !oldKnows) {
        merged.entries[key] = structuredClone(incoming);
        continue;
      }
      // A deletion wins a concurrent edit; the edited copy is retained for recovery.
      const winner =
        old.deleted !== incoming.deleted
          ? old.deleted
            ? old
            : incoming
          : compare(old, incoming) >= 0
            ? old
            : incoming;
      const loser = winner === old ? incoming : old;
      if (!oldKnows && !newKnows && old.hash !== incoming.hash && !loser.deleted)
        merged.conflicts[keyFor(key, stableJSON(loser.stamp))] = { key, ...structuredClone(loser) };
      const clock = { ...old.clock };
      for (const [device, counter] of Object.entries(incoming.clock))
        clock[device] = Math.max(clock[device] || 0, counter);
      merged.entries[key] = { ...structuredClone(winner), clock };
    }
  }
  // A source deletion also removes children created concurrently on another device.
  // Keep those unseen edits as recovery copies before recording their tombstones.
  for (const [key, entry] of Object.entries(merged.entries)) {
    const [store] = JSON.parse(key);
    if (entry.deleted || store === 'pages' || store === 'settings') continue;
    const parent =
      store === 'assets' && entry.value.type === 'application/pdf'
        ? entry.value.id
        : entry.value.pageId;
    const page = merged.entries[keyFor('pages', parent)];
    if (!page?.deleted) continue;
    merged.conflicts[keyFor(key, stableJSON(entry.stamp))] = { key, ...structuredClone(entry) };
    merged.counter++;
    const clock = { ...entry.clock };
    for (const [device, counter] of Object.entries(page.clock))
      clock[device] = Math.max(clock[device] || 0, counter);
    clock[merged.device] = merged.counter;
    merged.entries[key] = {
      deleted: true,
      hash: '',
      clock,
      stamp: [merged.counter, merged.device],
    };
  }
  return merged;
}
export function projectState(state, current) {
  const backup = {
    format: 'margin-backup',
    version: VERSION,
    pages: [],
    highlights: [],
    cards: [],
    assets: [],
    settings: { ...DEFAULT_SETTINGS },
  };
  const ids = new Map(current.pages.map((page) => [canonicalUrl(page.url), page.id]));
  const active = Object.entries(state.entries).filter(([, entry]) => !entry.deleted);
  const pages = new Set(
    active.filter(([key]) => JSON.parse(key)[0] === 'pages').map(([, entry]) => entry.value.id),
  );
  for (const [key, entry] of active) {
    const [store, id] = JSON.parse(key),
      value = structuredClone(entry.value);
    if (store === 'settings') {
      backup.settings[id] = value;
      continue;
    }
    if (store === 'pages') {
      if (!ids.has(id)) ids.set(id, crypto.randomUUID());
      backup.pages.push({ ...value, id: ids.get(id) });
    }
  }
  const highlightIds = new Set(
    active
      .filter(
        ([key, entry]) => JSON.parse(key)[0] === 'highlights' && pages.has(entry.value.pageId),
      )
      .map(([, entry]) => entry.value.id),
  );
  for (const [key, entry] of active) {
    const [store] = JSON.parse(key),
      value = structuredClone(entry.value);
    if (store === 'pages' || store === 'settings') continue;
    if (store === 'assets' && value.type === 'application/pdf') {
      if (pages.has(value.id)) backup.assets.push({ ...value, id: ids.get(value.id) });
    } else if (pages.has(value.pageId)) {
      if (value.highlightId && !highlightIds.has(value.highlightId)) value.highlightId = '';
      backup[store].push({ ...value, pageId: ids.get(value.pageId) });
    }
  }
  validateBackup(backup);
  return backup;
}
export async function validateState(data) {
  const invalid = () => {
    throw new Error(
      'A Google Drive sync file is invalid or from an unsupported version. Local data was kept.',
    );
  };
  if (
    !data ||
    data.format !== SYNC_FORMAT ||
    data.version !== 1 ||
    !validDevice(data.device) ||
    !Number.isSafeInteger(data.counter) ||
    data.counter < 0 ||
    !data.entries ||
    !data.conflicts
  )
    invalid();
  const check = async (key, entry) => {
    let store, id;
    try {
      [store, id] = JSON.parse(key);
    } catch {
      invalid();
    }
    if (
      ![...groups, 'settings'].includes(store) ||
      typeof id !== 'string' ||
      !id ||
      !entry ||
      typeof entry.deleted !== 'boolean' ||
      !entry.clock ||
      !Array.isArray(entry.stamp) ||
      entry.stamp.length !== 2 ||
      !Number.isSafeInteger(entry.stamp[0]) ||
      entry.stamp[0] < 1 ||
      !Object.entries(entry.clock).length ||
      Object.entries(entry.clock).some(
        ([device, value]) =>
          !validDevice(device) || !Number.isSafeInteger(value) || value < 1 || value > data.counter,
      ) ||
      !validDevice(entry.stamp[1]) ||
      entry.clock[entry.stamp[1]] !== entry.stamp[0]
    )
      invalid();
    if (store === 'settings' && !Object.hasOwn(DEFAULT_SETTINGS, id)) invalid();
    if (
      !entry.deleted &&
      ((store !== 'settings' && entry.value?.id !== id) ||
        (await digest(entry.value)) !== entry.hash)
    )
      invalid();
  };
  for (const [key, entry] of Object.entries(data.entries)) await check(key, entry);
  for (const entry of Object.values(data.conflicts)) await check(entry.key, entry);
  // Validate record content and references before any IndexedDB write.
  projectState(data, { pages: [] });
  return data;
}
