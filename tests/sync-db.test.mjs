import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';
import { captureState, emptyState, projectState } from '../src/sync-state.js';
test('sync atomically replaces data and journal, validates preferences, and keeps auth out of backups', async () => {
  const page = await db.savePage({
    url: 'https://example.com/sync-db',
    title: 'Research',
    note: 'Keep me',
  });
  const h = await db.addHighlight({
    pageId: page.id,
    text: 'A quote',
    anchor: { exact: 'A quote' },
    color: '#ffe08a',
  });
  await db.saveAudioNote({
    id: 'audio:db',
    pageId: page.id,
    highlightId: h.id,
    type: 'audio/webm',
    base64: 'YWJj',
  });
  const original = await db.backupSnapshot(),
    state = await captureState(original, emptyState('device-a'));
  const projected = projectState(state, original);
  await db.applySyncedBackup(projected, state);
  assert.equal((await db.snapshot()).pages[0].id, page.id);
  assert.equal((await db.audioNotes(page.id))[0].highlightId, h.id);
  assert.equal((await db.get('settings', 'drive-journal')).value.device, 'device-a');
  const invalid = { ...projected, settings: { ...projected.settings, colors: ['broken'] } };
  await assert.rejects(db.applySyncedBackup(invalid, emptyState('bad')));
  assert.equal((await db.snapshot()).pages[0].note, 'Keep me');
  assert.equal((await db.get('settings', 'drive-journal')).value.device, 'device-a');
  assert.ok(!JSON.stringify(await db.backupSnapshot()).includes('drive-journal'));
});
