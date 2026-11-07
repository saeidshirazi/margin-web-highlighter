import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';

test('website drafts stay separate from saved notes and survive stale save or discard requests', async () => {
  const page = await db.savePage({ url: 'https://draft.example/', title: 'Drafts' });
  const highlight = await db.addHighlight({
    pageId: page.id,
    text: 'Quote',
    color: '#ffe08a',
    anchor: { exact: 'Quote', start: 0, end: 5 },
  });
  const id = highlight.id;
  const getDraft = () => db.noteDraft(id, { action: 'get' });
  const writeDraft = (token, text) => db.noteDraft(id, { action: 'write', token, text });
  try {
    await writeDraft('old', 'First edit');
    await writeDraft('new', 'Newer edit');
    await db.noteDraft(id, { action: 'discard', token: 'old' });
    await db.updateHighlight(id, { note: 'First edit' }, 'old');
    assert.deepEqual(await getDraft(), { token: 'new', text: 'Newer edit' });
    assert.equal(
      (await db.snapshot()).highlights.find((item) => item.id === id).note,
      'First edit',
    );
    await db.updateHighlight(id, { note: 'Newer edit' }, 'new');
    assert.equal(await getDraft(), null);
    await writeDraft('empty', '');
    assert.deepEqual(await getDraft(), { token: 'empty', text: '' });
    await db.noteDraft(id, { action: 'discard', token: 'empty' });
    assert.equal(await getDraft(), null);
    await writeDraft('delete', 'Unsaved');
    await db.restoreHighlight(await db.removeHighlight(id));
    assert.equal(await getDraft(), null);
    await writeDraft('cascade', 'Unsaved again');
  } finally {
    await db.removePage(page.id);
  }
  assert.equal(await getDraft(), null);
});

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

test('concurrent settings patches and card reviews preserve both changes', async () => {
  await Promise.all([db.saveSettings({ theme: 'dark' }), db.saveSettings({ readerWidth: 900 })]);
  const settings = await db.preferences();
  assert.equal(settings.theme, 'dark');
  assert.equal(settings.readerWidth, 900);
  const page = await db.savePage({ url: 'https://test.example/concurrent', title: 'Concurrent' });
  const card = await db.addCard({ pageId: page.id, question: 'Question', answer: 'Answer' });
  await Promise.all([db.gradeCard(card.id, true), db.gradeCard(card.id, true)]);
  assert.equal((await db.get('cards', card.id)).repetitions, 2);
  await db.removePage(page.id);
});

test('a failed PDF attachment write rolls back its page', async () => {
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'assets') throw new DOMException('Simulated full disk', 'QuotaExceededError');
    return originalPut.apply(this, args);
  };
  const url = 'https://test.example/failed.pdf';
  try {
    await assert.rejects(
      db.savePDF({ url, title: 'PDF', base64: 'JVBERi0=' }),
      /Simulated full disk/,
    );
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
  assert.equal((await db.pageData(url)).page, undefined);
});

test('a repeated undo cannot replace a newer highlight edit', async () => {
  const page = await db.savePage({ url: 'https://test.example/undo', title: 'Undo' });
  const highlight = await db.addHighlight({
    pageId: page.id,
    text: 'Quote',
    anchor: { exact: 'Quote' },
    color: '#ffe08a',
  });
  const removed = await db.removeHighlight(highlight.id);
  await db.restoreHighlight(removed);
  await db.updateHighlight(highlight.id, { note: 'Newer edit' });
  await assert.rejects(db.restoreHighlight(removed), /already in the library/);
  assert.equal((await db.get('highlights', highlight.id)).note, 'Newer edit');
  await db.removePage(page.id);
});

test('a study card cannot attach to a deleted or unrelated highlight', async () => {
  const page = await db.savePage({ url: 'https://test.example/study-card', title: 'Study' });
  await assert.rejects(
    db.addCard({
      pageId: page.id,
      highlightId: 'deleted-highlight',
      question: 'Question',
      answer: 'Answer',
    }),
    /source highlight/,
  );
  assert.equal((await db.snapshot()).cards.length, 0);
  await db.removePage(page.id);
});
