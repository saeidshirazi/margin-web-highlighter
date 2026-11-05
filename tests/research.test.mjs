import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyPoints, explanationSource } from '../src/key-points.js';
import { searchMatch, searchPages } from '../src/core.js';
import {
  backupSnapshot,
  importBackup,
  readingProgress,
  removePage,
  savePage,
  saveReadingProgress,
  snapshot,
} from '../src/db.js';

test('offline key points use unique excerpts in source order and handle Persian text', () => {
  const input = 'خواندن مفید است. یادداشت‌ها به یادگیری کمک می‌کنند. خواندن مفید است.';
  const points = keyPoints(input);
  assert.equal(points.length, 2);
  assert.ok(points.every((point) => input.includes(point)));
  assert.ok(input.indexOf(points[0]) < input.indexOf(points[1]));
  assert.deepEqual(keyPoints('  '), []);
  assert.ok(keyPoints('word '.repeat(1000))[0].length <= 400);
});

test('explanation context includes the quote and falls back to its saved anchor', () => {
  const highlight = { text: 'needle', anchor: { prefix: 'Before', suffix: 'After' } };
  assert.deepEqual(JSON.parse(explanationSource({}, highlight)), {
    quote: 'needle',
    context: 'Before needle After',
  });
  const context = JSON.parse(
    explanationSource({ text: 'x'.repeat(2000) + 'near needle here' }, highlight),
  );
  assert.ok(context.context.endsWith('near needle here'));
  assert.ok(context.context.length < 1100);
  assert.equal(
    JSON.parse(explanationSource({ text: 'first needle. second needle.' }, highlight)).context,
    'Before needle After',
  );
});

test('search matches literal punctuation and retains the destination of a note or PDF excerpt', () => {
  const page = {
    id: 'pdf',
    title: 'Article',
    type: 'pdf',
    tags: [],
    text: 'First page.\n\nSecond C++ page.',
  };
  const hit = searchMatch(page, [], 'c++');
  assert.equal(hit.match, 'C++');
  assert.equal(hit.pdfPage, 2);
  const highlight = {
    id: 'quote',
    pageId: page.id,
    text: 'Quote',
    tags: [],
    note: 'A detailed note',
  };
  assert.equal(searchMatch(page, [highlight], 'DETAILED').highlightId, 'quote');
  assert.equal(searchMatch(page, [highlight], 'DETAILED').kind, 'highlight-note');
  assert.deepEqual(searchPages([page], [], { query: '[missing]' }), []);
});

test('reading progress clamps positions, persists its collapsed state and stays out of backups', async () => {
  const page = await savePage({ url: 'https://example.test/reading', title: 'Reading' });
  await Promise.all([
    saveReadingProgress({ id: page.id, kind: 'reader', position: 3 }),
    saveReadingProgress({ collapsed: true }),
  ]);
  const progress = await readingProgress();
  assert.ok(Number.isSafeInteger(progress.entries[0].updatedAt));
  assert.equal(await saveReadingProgress({ id: page.id, kind: 'reader', position: 1 }), false);
  assert.deepEqual(await readingProgress(), {
    entries: [
      { id: page.id, kind: 'reader', position: 1, updatedAt: progress.entries[0].updatedAt },
    ],
    collapsed: true,
  });
  assert.ok(!JSON.stringify(await backupSnapshot()).includes('device-reading-progress'));
  await removePage(page.id);
  await saveReadingProgress({ id: page.id, kind: 'reader', position: 0.3 });
  assert.equal((await readingProgress()).entries[0].position, 1);
});

test('restore preview does not write, reports conflicts and rolls back a changed preview', async () => {
  const existing = await savePage({
    url: 'https://example.test/local',
    title: 'Local',
    note: 'Keep me',
  });
  const backup = {
    format: 'margin-backup',
    version: 2,
    pages: [
      { id: 'existing', url: existing.url, title: 'Imported title', note: 'Incoming note' },
      { id: 'new', url: 'https://example.test/new', title: 'New', type: 'pdf' },
    ],
    highlights: [
      { id: 'h', pageId: 'existing', text: 'Quote', color: '#ffe08a', anchor: { exact: 'Quote' } },
    ],
    cards: [],
    assets: [
      { id: 'new', type: 'application/pdf', base64: 'cGRm' },
      { id: 'new', type: 'application/pdf', base64: 'cGRm' },
    ],
  };
  const before = await snapshot();
  const { report } = await importBackup(backup, { preview: true });
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(report.sources, { added: 1, merged: 1 });
  assert.equal(report.highlights.added, 1);
  assert.deepEqual(report.attachments, { added: 1, skipped: 1 });
  assert.equal(report.attention.total, 1);
  await savePage({ url: 'https://example.test/new', title: 'Added after preview' });
  const changed = await snapshot();
  await assert.rejects(importBackup(backup, { expected: report }), /changed since this preview/);
  assert.deepEqual(await snapshot(), changed);
  const next = await importBackup(backup, { preview: true });
  assert.deepEqual((await importBackup(backup, { expected: next.report })).report, next.report);
  assert.equal((await snapshot()).pages.find((page) => page.id === existing.id).note, 'Keep me');
  assert.equal((await importBackup(backup, { preview: true })).report.highlights.skipped, 1);
});
