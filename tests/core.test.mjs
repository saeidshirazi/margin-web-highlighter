import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalUrl,
  searchPages,
  cleanTags,
  toHTML,
  toMarkdown,
  csv,
  reviewCard,
  validateBackup,
} from '../src/core.js';
const p = {
  id: 'p1',
  url: 'https://example.com/read',
  title: 'Reading slowly',
  tags: ['research'],
  note: 'Page thought',
  collection: 'Work',
  updatedAt: 10,
};
const h = {
  id: 'h1',
  pageId: 'p1',
  text: 'A quote to remember',
  color: '#ffe08a',
  note: 'An insight',
  tags: ['idea'],
  anchor: { exact: 'A quote' },
  createdAt: 5,
};
test('canonical URLs retain identity parameters and drop tracking and fragments', () => {
  assert.equal(
    canonicalUrl('https://example.com/watch?v=123&utm_source=x#t=4'),
    'https://example.com/watch?v=123',
  );
  assert.throws(() => canonicalUrl('javascript:alert(1)'));
  assert.equal(
    canonicalUrl('https://example.com/#/articles/1'),
    'https://example.com/#/articles/1',
  );
});
test('library finds annotations, tags, colors and collections with intersecting filters', () => {
  assert.equal(
    searchPages([p], [h], { query: 'insight', color: '#ffe08a', tag: 'idea', collection: 'Work' })
      .length,
    1,
  );
  assert.equal(searchPages([p], [h], { color: '#000000' }).length, 0);
  assert.equal(searchPages([p], [h], { query: 'missing' }).length, 0);
});
test('tags normalize and deduplicate', () =>
  assert.deepEqual(cleanTags('a, a, b, , c'), ['a', 'b', 'c']));
test('exports escape HTML and reject unsafe URLs', () => {
  const html = toHTML(
    [{ ...p, title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' }],
    [{ ...h, text: '<script>bad</script>' }],
  );
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(toMarkdown([p], [h]).includes('> A quote to remember'));
});
test('CSV escapes formulas and quotes', () => {
  const text = csv([['=1+1', '"quote"', 'a,b']]);
  assert.ok(text.includes("'=1+1"));
  assert.ok(text.includes('""quote""'));
});
test('reviews increase intervals and retry failures in ten minutes', () => {
  let c = reviewCard({}, true, 0);
  assert.equal(c.dueAt, 86400000);
  c = reviewCard(c, true, 0);
  assert.equal(c.interval, 3);
  c = reviewCard(c, true, 0);
  assert.equal(c.interval, 7);
  c = reviewCard(c, false, 0);
  assert.equal(c.repetitions, 0);
  assert.equal(c.dueAt, 600000);
});
test('backup validation rejects corrupt data before any write', () => {
  const b = {
    format: 'margin-backup',
    version: 1,
    pages: [p],
    highlights: [h],
    cards: [],
    assets: [],
  };
  assert.equal(validateBackup(b).pages.length, 1);
  assert.throws(() => validateBackup({ ...b, version: 99 }));
  assert.throws(() => validateBackup({ ...b, highlights: [{ ...h, pageId: 'missing' }] }));
  assert.throws(() => validateBackup({ ...b, highlights: [{ ...h, color: 'red;bad' }] }));
  assert.throws(() => validateBackup({ ...b, pages: [p, p] }));
});
