import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { captureAnchor, locateAnchor, textIndex } from '../src/anchor.js';
import { paintHighlights } from '../src/anchor.js';

test('quotes survive whitespace differences between original page and reader', () => {
  const root = new JSDOM(
    '<main>A quote\n with   changed spacing.</main>',
  ).window.document.querySelector('main');
  const found = locateAnchor(root, { exact: 'quote with changed spacing.', start: 2, end: 29 });
  assert.equal(found.toString(), 'quote\n with   changed spacing.');
});
test('multiple document regions retain independent highlight styles', () => {
  const doc = new JSDOM('<main><p>First page</p><p>Second page</p></main>').window.document;
  const [a, b] = doc.querySelectorAll('p');
  const first = paintHighlights(a, [
    { id: 'a', color: '#ffe08a', anchor: { exact: 'First', start: 0, end: 5 } },
  ]);
  const second = paintHighlights(b, [
    { id: 'b', color: '#a8e6cf', anchor: { exact: 'Second', start: 0, end: 6 } },
  ]);
  assert.equal(doc.head.querySelectorAll('style').length, 2);
  first.dispose();
  assert.equal(doc.head.querySelectorAll('style').length, 1);
  second.dispose();
});
test('cross-element selections survive text changes before the quote', () => {
  const dom = new JSDOM(
    '<main><p>Before. Read <strong>these words</strong> and remember.</p></main>',
  );
  const doc = dom.window.document,
    root = doc.querySelector('main');
  const range = doc.createRange();
  range.setStart(doc.querySelector('p').firstChild, 8);
  range.setEnd(doc.querySelector('p').lastChild, 4);
  const anchor = captureAnchor(root, range);
  assert.equal(anchor.exact, 'Read these words and');
  doc.querySelector('p').firstChild.insertData(0, 'New introduction. ');
  assert.equal(locateAnchor(root, anchor).toString(), anchor.exact);
});
test('context disambiguates repeated quotes', () => {
  const dom = new JSDOM('<main>one word around. two word after.</main>');
  const root = dom.window.document.querySelector('main'),
    node = root.firstChild;
  const range = dom.window.document.createRange();
  range.setStart(node, 21);
  range.setEnd(node, 25);
  const a = captureAnchor(root, range);
  assert.equal(a.exact, 'word');
  node.insertData(0, 'extra ');
  const found = locateAnchor(root, a);
  assert.equal(found.startOffset, 27);
});
test('missing quotes return null without data loss', () => {
  const root = new JSDOM('<main>hello</main>').window.document.querySelector('main');
  assert.equal(locateAnchor(root, { exact: 'missing', start: 0, end: 7 }), null);
});
test('element boundary selections and ignored fields', () => {
  const dom = new JSDOM(
    '<main><p>visible <em>text</em></p><textarea>private</textarea><script>no</script></main>',
  );
  const root = dom.window.document.querySelector('main');
  assert.equal(textIndex(root).text, 'visible text');
  const range = dom.window.document.createRange();
  range.selectNodeContents(root.querySelector('p'));
  assert.equal(captureAnchor(root, range).exact, 'visible text');
});
