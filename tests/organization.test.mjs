import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';
import {
  collectionTree,
  collectionTarget,
  inCollection,
  normalizePreset,
  presetPages,
} from '../src/organization.js';
import { searchPages } from '../src/core.js';
import { captureState, projectState, stableJSON } from '../src/sync-state.js';

test('collection navigation includes parents and descendants without matching similar prefixes', () => {
  const pages = [
    { id: 'a', collection: 'Research/Reading', tags: [], updatedAt: 1 },
    { id: 'b', collection: 'Research/Reading/Books', tags: [], updatedAt: 1 },
    { id: 'c', collection: 'Researcher', tags: [], updatedAt: 1 },
  ];
  const tree = collectionTree(pages);
  assert.equal(tree.find((node) => node.path === 'Research').count, 2);
  assert.equal(tree.find((node) => node.path === 'Research/Reading').count, 2);
  assert.deepEqual(
    searchPages(pages, [], { collection: 'Research' }).map((page) => page.id),
    ['a', 'b'],
  );
  assert.equal(inCollection('Researcher', 'Research'), false);
  assert.equal(collectionTarget(' Research // Reading '), 'Research/Reading');
  assert.throws(() => collectionTarget('../Reading'), /collection path/);
  assert.throws(() => collectionTarget('A\\B'), /collection path/);
});
test('branch rename and undo preserve linked research and later note edits; scoped presets follow', async () => {
  const parent = await db.savePage({
    url: 'https://example.test/organize/a',
    title: 'A',
    collection: 'Work/Reading',
    note: 'Initial',
  });
  const child = await db.savePage({
    url: 'https://example.test/organize/b',
    title: 'B',
    collection: 'Work/Reading/Books',
  });
  const h = await db.addHighlight({
    pageId: parent.id,
    text: 'Keep',
    anchor: { exact: 'Keep' },
    color: '#ffe08a',
    note: 'A quote note',
  });
  const card = await db.addCard({
    pageId: parent.id,
    highlightId: h.id,
    question: 'Q',
    answer: 'A',
  });
  await db.saveAudioNote({
    id: 'audio:organization',
    pageId: parent.id,
    highlightId: h.id,
    name: 'Voice',
    type: 'audio/webm',
    base64: 'YWJj',
    createdAt: 1,
  });
  await db.saveExportPreset({
    id: 'scope-recipe',
    name: 'Scope recipe',
    format: 'agent',
    scope: 'collection',
    collection: 'Work/Reading',
    metadata: true,
  });
  const result = await db.organizeCollection({ from: 'Work', to: 'Projects' });
  assert.equal(result.count, 2);
  assert.equal((await db.get('pages', child.id)).collection, 'Projects/Reading/Books');
  assert.equal((await db.snapshot()).exportPresets[0].collection, 'Projects/Reading');
  await db.savePage({ url: parent.url, note: 'Edited after the move' });
  await db.undoOrganization(result.undo);
  assert.equal((await db.get('pages', parent.id)).note, 'Edited after the move');
  assert.equal((await db.get('pages', child.id)).collection, child.collection);
  assert.equal((await db.get('highlights', h.id)).note, h.note);
  assert.equal((await db.get('cards', card.id)).highlightId, h.id);
  assert.equal((await db.get('assets', 'audio:organization')).highlightId, h.id);
  assert.equal((await db.snapshot()).exportPresets[0].collection, 'Work/Reading');
});
test('collection collisions, cycles and stale bulk moves reject atomically', async () => {
  const page = await db.savePage({
    url: 'https://example.test/collision',
    title: 'Existing',
    collection: 'Existing/Child',
  });
  await assert.rejects(
    () => db.organizeCollection({ from: 'Work', to: 'Existing' }),
    /already exists/,
  );
  await assert.rejects(() => db.organizeCollection({ from: 'Work', to: 'Work/Child' }), /outside/);
  await assert.rejects(
    () =>
      db.organizeCollection({ from: 'Work', to: 'One/Two/Three/Four/Five/Six/Seven/Eight/Nine' }),
    /collection path/,
  );
  assert.equal(
    (await db.snapshot()).pages.find((item) => item.url === 'https://example.test/organize/b')
      .collection,
    'Work/Reading/Books',
  );
  const before = (await db.get('pages', page.id)).collection;
  await assert.rejects(
    () => db.movePagesToCollection({ ids: [page.id, 'deleted-id'], collection: 'Other' }),
    /Nothing was moved/,
  );
  assert.equal((await db.get('pages', page.id)).collection, before);
  const work = (await db.snapshot()).pages.find((item) => item.collection === 'Work/Reading');
  const result = await db.movePagesToCollection({ ids: [page.id, work.id], collection: 'Moved' });
  await db.removePage(work.id);
  await assert.rejects(() => db.undoOrganization(result.undo), /No changes were undone/);
  assert.equal((await db.get('pages', page.id)).collection, 'Moved');
});
test('removing collection labels unfiles a branch and never deletes its sources', async () => {
  const a = await db.savePage({
    url: 'https://example.test/remove/a',
    title: 'A',
    collection: 'Remove/Sub',
  });
  const b = await db.savePage({
    url: 'https://example.test/remove/b',
    title: 'B',
    collection: 'Remove/Sub/Deeper',
  });
  const result = await db.organizeCollection({ from: 'Remove', remove: true });
  assert.equal(result.count, 2);
  assert.equal((await db.get('pages', a.id)).collection, '');
  assert.equal((await db.get('pages', b.id)).collection, '');
  await db.undoOrganization(result.undo);
  assert.equal((await db.get('pages', b.id)).collection, b.collection);
});
test('presets whitelist portable settings and resolve scopes without widening an empty result', () => {
  const preset = normalizePreset({
    id: 'recipe',
    name: 'For my agent',
    format: 'agent',
    scope: 'collection',
    collection: 'Work',
    includeSource: true,
    password: 'never-store',
    apiKey: 'never-store',
  });
  assert.equal(preset.password, undefined);
  assert.equal(preset.apiKey, undefined);
  assert.throws(() => normalizePreset({ ...preset, format: 'json' }), /research format/);
  const snapshot = {
    pages: [
      { id: 'a', collection: 'Work/Sub' },
      { id: 'b', collection: 'Other' },
    ],
  };
  assert.deepEqual(
    presetPages(preset, snapshot, []).map((page) => page.id),
    ['a'],
  );
  assert.deepEqual(presetPages({ ...preset, collection: 'Missing' }, snapshot, snapshot.pages), []);
  assert.deepEqual(
    presetPages({ ...preset, scope: 'view' }, snapshot, [snapshot.pages[1]]).map((page) => page.id),
    ['b'],
  );
});
test('full backups restore presets repeat-safely and reject malformed metadata before modifying research', async () => {
  const backup = await db.backupSnapshot();
  const preset = backup.exportPresets[0];
  assert.ok(preset);
  await db.deleteExportPreset(preset.id);
  await db.importBackup(backup);
  await db.importBackup(backup);
  assert.equal((await db.snapshot()).exportPresets.length, 1);
  const collision = {
    ...backup,
    exportPresets: [
      { ...preset, id: 'imported-recipe', name: preset.name.toUpperCase(), includeSource: true },
    ],
  };
  await db.importBackup(collision);
  await db.importBackup(collision);
  const names = (await db.snapshot()).exportPresets.map((item) => item.name.toLowerCase());
  assert.equal(names.length, 2);
  assert.equal(new Set(names).size, 2);
  const invalid = {
    ...backup,
    pages: [
      ...backup.pages,
      { ...backup.pages[0], id: 'unsafe-import', url: 'https://example.test/should-not-import' },
    ],
    exportPresets: [{ ...preset, format: 'json' }],
  };
  await assert.rejects(() => db.importBackup(invalid), /research format/);
  assert.ok(!(await db.snapshot()).pages.some((page) => page.id === 'unsafe-import'));
});
test('Drive replicas exclude device presets and projections keep each browser’s own presets', async () => {
  const backup = await db.backupSnapshot(),
    state = await captureState(backup);
  assert.ok(!JSON.stringify(state).includes('Scope recipe'));
  const localPreset = normalizePreset({
    id: 'local',
    name: 'This browser only',
    format: 'md',
    scope: 'all',
  });
  const projected = projectState(state, { pages: [], exportPresets: [localPreset] });
  assert.deepEqual(projected.exportPresets, [localPreset]);
  await db.applySyncedBackup(projectState(state, backup), state);
  const canonical = await db.backupSnapshot();
  const next = await captureState(canonical, state);
  assert.equal(
    stableJSON(projectState(next, canonical)),
    stableJSON({ ...canonical, exportedAt: undefined }),
  );
});
