import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/core.js';
import {
  emptyState,
  captureState,
  mergeStates,
  projectState,
  validateState,
  stableJSON,
} from '../src/sync-state.js';
const key = (store, id) => JSON.stringify([store, id]);
const url = 'https://example.com/research';
function backup(id = 'page-a', note = 'Original') {
  return {
    format: 'margin-backup',
    version: 2,
    pages: [
      { id, url, title: 'Research', type: 'web', tags: [], note, createdAt: 1, updatedAt: 1 },
    ],
    highlights: [
      {
        id: 'highlight-a',
        pageId: id,
        text: 'Quote',
        anchor: { exact: 'Quote', start: 0, end: 5 },
        color: '#ffe08a',
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    cards: [
      {
        id: 'card-a',
        pageId: id,
        highlightId: 'highlight-a',
        question: 'Question',
        answer: 'Answer',
        dueAt: 1,
      },
    ],
    assets: [
      {
        id: 'audio:a',
        pageId: id,
        highlightId: 'highlight-a',
        type: 'audio/webm',
        base64: 'YWJj',
        name: 'Voice',
      },
    ],
    settings: { ...DEFAULT_SETTINGS },
  };
}
test('sync carries every record, settings and binary attachments while preserving local page IDs', async () => {
  const source = backup();
  source.assets.push({ id: 'page-a', type: 'application/pdf', base64: 'JVBERi0=' });
  source.settings.translationTarget = 'fr';
  const state = await captureState(source, emptyState('device-a'));
  await validateState(state);
  const restored = projectState(state, { pages: [{ id: 'different-device-id', url }] });
  assert.equal(restored.pages[0].id, 'different-device-id');
  assert.equal(restored.highlights[0].pageId, 'different-device-id');
  assert.equal(restored.cards[0].highlightId, 'highlight-a');
  assert.equal(restored.assets.find((a) => a.type === 'application/pdf').id, 'different-device-id');
  assert.equal(restored.assets.find((a) => a.type === 'audio/webm').base64, 'YWJj');
  assert.equal(restored.settings.translationTarget, 'fr');
  assert.equal((await captureState(restored, state)).counter, state.counter);
});
test('concurrent edits converge and preserve the losing text in recovery copies', async () => {
  const source = backup(),
    initial = await captureState(source, emptyState('device-a'));
  const a = await captureState(
    { ...source, pages: [{ ...source.pages[0], note: 'Edit A' }] },
    initial,
  );
  const b = await captureState(
    { ...source, pages: [{ ...source.pages[0], note: 'Edit B' }] },
    { ...initial, device: 'device-b' },
  );
  const ab = mergeStates(a, b),
    ba = mergeStates(b, a);
  assert.equal(stableJSON(ab.entries), stableJSON(ba.entries));
  assert.equal(stableJSON(ab.conflicts), stableJSON(ba.conflicts));
  assert.equal(Object.keys(ab.conflicts).length, 1);
  const notes = [
    ab.entries[key('pages', url)].value.note,
    ...Object.values(ab.conflicts).map((x) => x.value.note),
  ];
  assert.deepEqual(notes.sort(), ['Edit A', 'Edit B']);
  await validateState(ab);
  assert.equal(stableJSON(mergeStates(ab, a, b).entries), stableJSON(ab.entries));
});
test('deletions persist against stale devices and concurrent edits remain recoverable', async () => {
  const source = backup(),
    initial = await captureState(source, emptyState('device-a'));
  const removed = await captureState(
    { ...source, pages: [], highlights: [], cards: [], assets: [] },
    initial,
  );
  assert.equal(projectState(mergeStates(initial, removed), source).pages.length, 0);
  const changed = await captureState(
    { ...source, pages: [{ ...source.pages[0], note: 'Unsynced edit' }] },
    { ...initial, device: 'device-b' },
  );
  const merged = mergeStates(changed, removed);
  assert.equal(projectState(merged, source).pages.length, 0);
  assert.ok(Object.values(merged.conflicts).some((x) => x.value.note === 'Unsynced edit'));
  const after = await captureState(projectState(merged, source), merged);
  assert.equal(projectState(mergeStates(after, initial), source).pages.length, 0);
  const recreated = await captureState({ ...source, highlights: [], cards: [], assets: [] }, after);
  assert.equal(projectState(recreated, source).highlights.length, 0);
});
test('same source saved independently on two devices becomes one page without losing either highlight', async () => {
  const aSource = backup(),
    bSource = backup('page-b', 'Other note');
  bSource.highlights[0].id = 'highlight-b';
  bSource.cards = [];
  bSource.assets = [];
  const a = await captureState(aSource, emptyState('device-a')),
    b = await captureState(bSource, emptyState('device-b'));
  const merged = projectState(mergeStates(a, b), aSource);
  assert.equal(merged.pages.length, 1);
  assert.equal(merged.highlights.length, 2);
  assert.ok(merged.highlights.every((h) => h.pageId === 'page-a'));
});
test('a fresh installation does not override remote language preferences with its defaults', async () => {
  const source = backup();
  source.settings.translationTarget = 'fr';
  const a = await captureState(source, emptyState('device-a'));
  const b = await captureState(
    { ...backup(), pages: [], highlights: [], cards: [], assets: [] },
    emptyState('device-b'),
  );
  assert.equal(projectState(mergeStates(b, a), { pages: [] }).settings.translationTarget, 'fr');
});
test('corrupt and future sync files are rejected before changing the database', async () => {
  const state = await captureState(backup(), emptyState('device-a'));
  const corrupt = structuredClone(state);
  corrupt.entries[key('pages', url)].value.note = 'Changed without digest';
  await assert.rejects(validateState(corrupt), /invalid/);
  await assert.rejects(validateState({ ...state, version: 99 }), /invalid/);
  const malformed = structuredClone(state);
  malformed.entries[key('pages', url)].clock['device-a'] = -1;
  await assert.rejects(validateState(malformed), /invalid/);
});
