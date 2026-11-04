import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';
test('database lifecycle, merge, invalid import atomicity and deletion cascade', async () => {
  const page = await db.savePage({
    url: 'https://test.example/read',
    title: 'Test',
    bookmarked: true,
  });
  const again = await db.savePage({ url: page.url, title: 'New title' });
  assert.equal(again.id, page.id);
  assert.equal(again.bookmarked, true);
  const h = await db.addHighlight({
    pageId: page.id,
    text: 'Quote',
    color: '#ffe08a',
    anchor: { exact: 'Quote', start: 0, end: 5 },
  });
  await db.updateHighlight(h.id, { note: 'A note', tags: 'tag, tag' });
  const card = await db.addCard({
    pageId: page.id,
    highlightId: h.id,
    question: 'What?',
    answer: 'Quote',
  });
  await db.gradeCard(card.id, true);
  const snap = await db.snapshot();
  assert.equal(snap.highlights[0].note, 'A note');
  assert.deepEqual(snap.highlights[0].tags, ['tag']);
  assert.equal(snap.cards[0].interval, 1);
  const backup = { ...snap, format: 'margin-backup', version: 1, assets: [] };
  await db.importBackup(backup);
  await db.importBackup(backup);
  assert.equal((await db.snapshot()).highlights.length, 1);
  assert.equal((await db.snapshot()).cards.length, 1);
  await assert.rejects(db.importBackup({ ...backup, highlights: [{ ...h, pageId: 'absent' }] }));
  assert.equal((await db.snapshot()).pages.length, 1);
  const removed = await db.removeHighlight(h.id);
  assert.equal((await db.snapshot()).cards.length, 0);
  await db.restoreHighlight(removed);
  assert.equal((await db.snapshot()).highlights.length, 1);
  await db.removePage(page.id);
  const empty = await db.snapshot();
  assert.equal(empty.pages.length, 0);
  assert.equal(empty.highlights.length, 0);
  await db.importBackup(backup);
  const restored = await db.snapshot();
  assert.equal(restored.cards[0].highlightId, restored.highlights[0].id);
  await db.removeHighlight(restored.highlights[0].id);
  assert.equal((await db.snapshot()).cards.length, 0);
  await db.removePage(restored.pages[0].id);
});
test('settings validate colors and clamp reader controls', async () => {
  const settings = await db.saveSettings({ readerSize: 900, readerWidth: 1, color: '#abcdef' });
  assert.equal(settings.readerSize, 36);
  assert.equal(settings.readerWidth, 440);
  await assert.rejects(db.saveSettings({ colors: ['nope'] }));
});
