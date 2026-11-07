import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
globalThis.window = dom.window;
const { renderMarkdown } = await import('../src/markup.js');

test('Markdown keeps formatting and links while removing active and embedded content', () => {
  const output = renderMarkdown(
    '**Keep this** [Source](https://example.test)\n\n<img src="https://example.test/image"><svg><image href="https://example.test/svg"></image></svg><form><input></form><a href="javascript:alert(1)" ping="https://example.test/track" style="background:url(https://example.test/style)">Link</a>',
  );
  const document = new JSDOM(output).window.document;
  assert.equal(document.querySelector('strong').textContent, 'Keep this');
  assert.equal(document.querySelector('a').href, 'https://example.test/');
  assert.equal(
    document.querySelector('img, svg, image, form, input, [ping], [style], [src]'),
    null,
  );
  assert.equal(
    [...document.querySelectorAll('a')].some((a) => a.href.startsWith('javascript:')),
    false,
  );
});

test('note HTML cannot impersonate application controls or clobber named elements', () => {
  const output = renderMarkdown(
    '<button data-action="delete-page">Delete</button><span data-edit="other-record" id="ai-status">Text</span>',
  );
  const document = new JSDOM(output).window.document;
  assert.equal(document.querySelector('button, [data-action], [data-edit], #ai-status'), null);
  assert.equal(document.querySelector('span').id, 'user-content-ai-status');
});
