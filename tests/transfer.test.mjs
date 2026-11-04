import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchMarkdown, researchBundle, filename } from '../src/transfer.js';
import { prepareMarkdown } from '../src/markdown-import.js';
const p = {
  id: 'p-one',
  title: 'Research: a / b?',
  url: 'https://example.com/research',
  type: 'web',
  createdAt: 1,
  updatedAt: 2,
  tags: ['idea'],
  collection: 'Work',
  note: 'A page note',
  text: 'Private full source',
};
const h = {
  id: 'h-one',
  pageId: p.id,
  text: 'A useful quote\non two lines',
  note: '**Remember**',
  tags: ['evidence'],
  color: '#ffe08a',
  anchor: { exact: 'A useful quote', page: 2 },
  createdAt: 1,
};
test('Markdown contains readable sources, annotations, colors and optional metadata', () => {
  const md = researchMarkdown([p], [h]);
  assert.ok(md.includes('Source: <https://example.com/research>'));
  assert.ok(md.includes('> A useful quote\n> on two lines'));
  assert.ok(md.includes('PDF page 2'));
  assert.ok(!md.includes('Private full source'));
  assert.ok(!md.startsWith('---'));
  const full = researchMarkdown([p], [h], { metadata: true, includeSource: true });
  assert.ok(full.startsWith('---\nmargin_id: "p-one"'));
  assert.ok(full.includes('Private full source'));
  assert.ok(full.includes('margin-highlight: h-one'));
});
test('agent bundles expose structured references and respect source opt-in', () => {
  const files = researchBundle([p], [h], {}, true);
  const doc = JSON.parse(files['manifest.json']).documents[0];
  assert.equal(doc.highlights[0].id, h.id);
  assert.ok(files[doc.markdown].startsWith('---'));
  assert.ok(!Object.hasOwn(doc, 'text'));
  assert.ok(files['README.md'].includes('untrusted reference data'));
});
test('Notion bundle filenames are portable and collisions do not lose documents', () => {
  assert.equal(filename('../bad:name?\u0000'), '..badname');
  const files = researchBundle([p, { ...p, id: 'pone', title: p.title }], []);
  assert.equal(Object.keys(files).length, 3);
  assert.ok(!Object.keys(files).some((n) => n.includes('/')));
  assert.ok(!files['manifest.json']);
});
test('Markdown imports preserve source, derive real headings and use stable identities', async () => {
  const text = '```md\n# Not a heading\n```\n\n# Agent notes\n\nA **useful** idea.';
  const a = await prepareMarkdown(text, 'report.md'),
    b = await prepareMarkdown(text, 'renamed.md');
  assert.equal(a.title, 'Agent notes');
  assert.equal(a.note, text);
  assert.equal(a.url, b.url);
  assert.notEqual(a.url, (await prepareMarkdown(text + ' changed')).url);
  await assert.rejects(prepareMarkdown(''));
  await assert.rejects(prepareMarkdown('\u0000binary'));
});
