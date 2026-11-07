import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { encryptBackup } from '../src/backup.js';
import { browserTarget, extensionFolder, launchOptions } from './chromium-target.mjs';

const context = await chromium.launchPersistentContext('', {
  ...launchOptions,
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: [`--disable-extensions-except=${extensionFolder}`, `--load-extension=${extensionFolder}`],
});
const errors = [];
context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const base = worker.url().replace('background.js', '');
  const library = await context.newPage();
  await library.goto(base + 'library.html');
  const api = (type, payload = {}) =>
    library.evaluate(
      async ({ type, payload }) => {
        const response = await chrome.runtime.sendMessage({ type, payload });
        if (!response.ok) throw new Error(response.error);
        return response.data;
      },
      { type, payload },
    );
  const quote = 'Reading notes preserve context. They help recall important evidence.';
  const paragraphs = Array.from(
    { length: 65 },
    (_, n) => `Reading paragraph ${n}. It records more evidence for the library.`,
  );
  const tail = 'ReaderNeedle is near the end.';
  const french = 'Bonjour, nous allons lire quelques pages en français cet après-midi.';
  const source = await api('save-page', {
    url: 'https://example.test/research-flow',
    title: 'Research article',
    collection: 'Research/Methods',
    bookmarked: true,
    text: [...paragraphs, quote, tail, french].join('\n\n'),
    article: [...paragraphs, quote, tail, french].map((part) => '<p>' + part + '</p>').join(''),
  });
  const highlight = await api('add-highlight', {
    pageId: source.id,
    text: quote,
    color: '#ffe08a',
    anchor: { exact: quote },
    note: 'SearchNote exact match',
  });
  await library.reload();
  const search = library.getByRole('textbox', { name: 'Search library' });
  await search.fill('searchnote');
  await expect(library.locator('.search-excerpt mark')).toHaveText('SearchNote');
  await library.getByRole('button', { name: 'Open matching highlight note' }).click();
  await expect(library.locator('[data-annotation] .note-preview')).toBeFocused();
  await library.locator('[data-highlight-points]').click();
  await expect(library.getByRole('dialog').locator('li')).toHaveCount(2);
  await library.getByRole('button', { name: 'Save to note' }).click();
  await expect
    .poll(async () => (await api('snapshot')).highlights[0].note)
    .toContain('### Key points');
  await library.evaluate(() =>
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined }),
  );
  await library.locator('[data-explain-highlight]').click();
  await expect(library.locator('[data-explanation-status]')).toContainText('unavailable');
  await expect(library.getByRole('button', { name: 'Save to note' })).toBeDisabled();
  await library.getByRole('button', { name: 'Cancel', exact: true }).click();
  await library.evaluate(() =>
    Object.defineProperty(globalThis, 'LanguageModel', {
      configurable: true,
      value: {
        availability: async () => 'available',
        create: async () => ({
          prompt: async (prompt) => {
            if (
              !prompt.includes('Reading notes preserve context') ||
              !prompt.includes('ReaderNeedle')
            )
              throw new Error('Missing quote context');
            return 'The quote says notes help readers remember why evidence matters.';
          },
          destroy() {},
        }),
      },
    }),
  );
  await library.locator('[data-explain-highlight]').click();
  await library.getByRole('button', { name: 'Generate explanation' }).click();
  await expect(library.locator('[data-explanation-result]')).toContainText(
    'remember why evidence matters',
  );
  await library.getByRole('button', { name: 'Save to note' }).click();
  await expect
    .poll(
      async () => (await api('snapshot')).highlights.find((item) => item.id === highlight.id).note,
    )
    .toContain('### Explain highlight');
  await library.getByRole('button', { name: 'Close details', exact: true }).click();
  await context.addInitScript(() => {
    const attach = globalThis.Element.prototype.attachShadow;
    globalThis.Element.prototype.attachShadow = function (options) {
      return attach.call(this, { ...options, mode: 'open' });
    };
    const synth = new EventTarget();
    synth.getVoices = () => [
      { name: 'Online voice', lang: 'en-US', voiceURI: 'online', localService: false },
      { name: 'Local US voice', lang: 'en-US', voiceURI: 'us', localService: true },
      { name: 'Local UK voice', lang: 'en-GB', voiceURI: 'uk', localService: true },
      { name: 'Local French voice', lang: 'fr-FR', voiceURI: 'fr', localService: true },
    ];
    globalThis.spokenSelections = [];
    synth.speak = (utterance) =>
      globalThis.spokenSelections.push([utterance.text, utterance.voice.voiceURI]);
    synth.cancel = () => {};
    Object.defineProperty(globalThis, 'speechSynthesis', { value: synth, configurable: true });
    globalThis.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
  });
  await search.fill('ReaderNeedle');
  const [reader] = await Promise.all([
    context.waitForEvent('page'),
    library.getByRole('button', { name: 'Go to matching text' }).click(),
  ]);
  await expect
    .poll(() => reader.evaluate(() => window.getSelection()?.toString()))
    .toBe('ReaderNeedle');
  await expect.poll(() => reader.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  await reader.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  const toolbar = reader.getByRole('toolbar', { name: 'Highlight selection' });
  await toolbar.getByRole('button', { name: 'Pronounce selection' }).click();
  await expect
    .poll(() => reader.evaluate(() => globalThis.spokenSelections))
    .toEqual([['ReaderNeedle', 'us']]);
  await expect(toolbar.getByLabel('Pronunciation voice')).toContainText('American English (US)');
  await expect(toolbar.getByLabel('Pronunciation voice')).toContainText('British English (UK)');
  await expect(toolbar.getByLabel('Pronunciation voice')).not.toContainText('Online voice');
  await expect(toolbar.getByRole('button', { name: 'Spell aloud' })).toHaveCount(0);
  await toolbar.getByLabel('Pronunciation voice').selectOption('uk');
  await expect
    .poll(() => reader.evaluate(() => globalThis.spokenSelections.at(-1)))
    .toEqual(['ReaderNeedle', 'uk']);
  let webRequests = 0;
  await context.route('https://translate.google.com/**', async (route) => {
    webRequests++;
    await route.fulfill({ body: 'Translation fixture' });
  });
  const [translation] = await Promise.all([
    context.waitForEvent('page'),
    toolbar.getByRole('button', { name: 'Translate selection' }).click(),
  ]);
  await expect(translation.locator('[name=sourceText]')).toHaveValue('ReaderNeedle');
  await expect(translation.locator('[name=source]')).toHaveValue('auto');
  await expect(translation.getByLabel('Translation output language')).toHaveValue('fa');
  assert.ok(!translation.url().includes('ReaderNeedle'));
  assert.equal(webRequests, 0);
  await translation.locator('[name=provider]').selectOption('web');
  const [provider] = await Promise.all([
    context.waitForEvent('page'),
    translation.getByRole('button', { name: 'Open Google Translate', exact: true }).click(),
  ]);
  await expect.poll(() => new URL(provider.url()).searchParams.get('text')).toBe('ReaderNeedle');
  await expect.poll(() => webRequests).toBeGreaterThan(0);
  assert.equal(new URL(provider.url()).searchParams.get('tl'), 'fa');
  await provider.close();
  await translation.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(translation.getByRole('dialog')).toHaveCount(0);
  await translation.close();
  assert.equal((await api('snapshot')).highlights.length, 1);
  await reader.evaluate(() => {
    const paragraph = document.querySelector('#article p:last-child');
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(toolbar.getByRole('button', { name: 'Pronounce selection' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await toolbar.getByRole('button', { name: 'Pronounce selection' }).click();
  await expect(toolbar.locator('[data-pronunciation-language]')).toContainText('Detected · French');
  await expect
    .poll(() => reader.evaluate(() => globalThis.spokenSelections.at(-1)))
    .toEqual([french, 'fr']);
  await reader.evaluate(() => window.scrollTo(0, 700));
  await expect.poll(() => reader.evaluate(() => window.scrollY)).toBe(700);
  await reader.waitForTimeout(350);
  await reader.close();
  await search.fill('');
  const recent = library.locator('[data-continue-reading]');
  await expect(recent.getByRole('link', { name: /Research article/ })).toBeVisible();
  await recent.locator('summary').click();
  await expect(recent).not.toHaveAttribute('open', '');
  await library.reload();
  await expect(recent.locator('summary')).toBeVisible();
  await expect(recent).not.toHaveAttribute('open', '');
  await recent.locator('summary').click();
  const [resumed] = await Promise.all([
    context.waitForEvent('page'),
    recent.getByRole('link', { name: /Research article/ }).click(),
  ]);
  await expect.poll(() => resumed.evaluate(() => window.scrollY)).toBeCloseTo(700, -1);
  await resumed.close();

  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('An ordinary opening page.', { x: 50, y: 600 });
  pdf.addPage().drawText('PdfNeedle is on page two.', { x: 50, y: 600 });
  await library.locator('[data-action=add]').click();
  await library.getByRole('dialog').locator('[data-action=pdf]').click();
  await library
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'Search PDF.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  const [indexer] = await Promise.all([
    context.waitForEvent('page'),
    library.getByRole('dialog').locator('button[type=submit]').click(),
  ]);
  await expect
    .poll(async () => (await api('snapshot')).pages.find((page) => page.type === 'pdf')?.text)
    .toContain('PdfNeedle');
  await indexer.close();
  await search.fill('pdfneedle');
  const [pdfView] = await Promise.all([
    context.waitForEvent('page'),
    library.getByRole('button', { name: 'Go to PDF page 2' }).click(),
  ]);
  await expect(pdfView.locator('#page-number')).toHaveValue('2');
  await expect(pdfView.locator('[data-pdf-page="2"] canvas')).toBeVisible();
  await pdfView.waitForTimeout(300);
  await pdfView.close();
  await search.fill('');
  await expect(recent.getByRole('link', { name: /Search PDF/ })).toContainText('PDF page 2');
  const [resumedPdf] = await Promise.all([
    context.waitForEvent('page'),
    recent.getByRole('link', { name: /Search PDF/ }).click(),
  ]);
  await expect(resumedPdf.locator('#page-number')).toHaveValue('2');
  await resumedPdf.close();

  const pdfSource = (await api('snapshot')).pages.find((page) => page.type === 'pdf');
  const pdfQuote = 'PdfNeedle is on page two.';
  const pdfHighlight = await api('add-highlight', {
    pageId: pdfSource.id,
    text: pdfQuote,
    color: '#ffe08a',
    anchor: { page: 2, exact: pdfQuote, quads: [] },
  });
  const otherQuote = 'A separate quote from the same source.';
  await api('add-highlight', {
    pageId: source.id,
    text: otherQuote,
    color: '#a8e6cf',
    anchor: { exact: otherQuote },
    tags: ['separate'],
  });
  await library.reload();
  await library.locator('[data-view=highlights]').click();
  await library.reload();
  const matches = library.locator('.library-highlight');
  await expect(matches).toHaveCount(3);
  await search.fill('searchnote');
  await expect(matches).toHaveCount(1);
  await expect(matches).toContainText(quote);
  await library.getByLabel('Filter by tag').selectOption('separate');
  await expect(matches).toHaveCount(0);
  await library.getByRole('button', { name: 'Clear filters' }).click();
  await expect(matches).toHaveCount(3);
  await library.getByLabel('Filter by collection').selectOption('path:Research');
  await expect(matches).toHaveCount(2);
  await library.getByRole('button', { name: 'Filter #a8e6cf' }).click();
  await expect(matches).toHaveCount(1);
  await expect(matches).toContainText(otherQuote);
  await library.getByRole('button', { name: 'Clear filters' }).click();
  await library.getByLabel('Bookmarked sources').check();
  await expect(matches).toHaveCount(2);
  await library.getByRole('button', { name: 'Clear filters' }).click();

  await library.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async (text) => {
        globalThis.copiedQuote = text;
      },
    });
  });
  const readCopiedQuote = () => library.evaluate(() => globalThis.copiedQuote);
  const webResult = matches.filter({ hasText: quote });
  await webResult.getByRole('button', { name: 'Copy quote with source' }).click();
  const expectedWebCopy = `${quote}\n\n${source.title}\n${source.url}`;
  await expect.poll(readCopiedQuote).toBe(expectedWebCopy);
  await webResult.getByRole('button', { name: 'Open highlight' }).click();
  const annotation = library.locator(`[data-annotation="${highlight.id}"]`);
  await expect(annotation).toBeFocused();
  await library.evaluate(() => {
    globalThis.copiedQuote = '';
  });
  await annotation.getByRole('button', { name: 'Copy quote with source' }).click();
  await expect.poll(readCopiedQuote).toBe(expectedWebCopy);
  await library.getByRole('button', { name: 'Close details', exact: true }).click();

  await library.getByLabel('Filter by document type').selectOption('pdf');
  await expect(matches).toHaveCount(1);
  await expect(matches).toContainText('PDF page 2');
  await matches.getByRole('button', { name: 'Copy quote with source' }).click();
  await expect.poll(readCopiedQuote).toBe(`${pdfQuote}\n\n${pdfSource.title} · PDF page 2`);
  const [highlightedPdf] = await Promise.all([
    context.waitForEvent('page'),
    matches.getByRole('button', { name: 'Open highlight' }).click(),
  ]);
  await expect(highlightedPdf).toHaveURL(new RegExp('highlight=' + pdfHighlight.id));
  await expect(highlightedPdf.locator('#page-number')).toHaveValue('2');
  await highlightedPdf.close();

  const data = await api('backup');
  data.pages.push({
    id: 'incoming',
    url: 'https://example.test/incoming',
    title: 'Incoming source',
  });
  data.pages.find((page) => page.id === source.id).note = 'Incoming note conflict';
  const encrypted = await encryptBackup(data, 'test-password');
  await library.locator('[data-view=settings]').click();
  async function choose(value) {
    const chooser = library.waitForEvent('filechooser');
    await library.locator('[data-action=import]').click();
    await (
      await chooser
    ).setFiles({
      name: 'restore.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    });
  }
  await choose(data);
  await expect(library.getByRole('heading', { name: 'Review backup restore' })).toBeVisible();
  await library.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await api('snapshot')).pages.length, 2);
  await choose(encrypted);
  await library.getByLabel('Backup password').fill('wrong');
  await library.getByRole('button', { name: 'Unlock and preview' }).click();
  await expect(library.getByRole('alert')).toContainText('Wrong password');
  await library.getByLabel('Backup password').fill('test-password');
  await library.getByRole('button', { name: 'Unlock and preview' }).click();
  await expect(library.getByRole('heading', { name: 'Review backup restore' })).toBeVisible();
  await expect(library.getByRole('dialog')).toContainText(
    'Kept local source details: Research article',
  );
  assert.equal((await api('snapshot')).pages.length, 2);
  await library.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await expect(library.getByRole('heading', { name: 'Restore complete' })).toBeVisible();
  await expect(library.getByRole('dialog')).toContainText('Review 1 items');
  assert.equal((await api('snapshot')).pages.length, 3);
  await library.getByRole('button', { name: 'Done', exact: true }).click();
  await library.locator('[data-view=bookmarks]').click();
  await library.reload();
  await expect(library.locator('[data-view=bookmarks]')).toHaveAttribute('aria-current', 'page');
  await library.locator('[data-view=settings]').click();
  await search.fill('Research');
  await expect(library.locator('[data-view=all]')).toHaveAttribute('aria-current', 'page');
  await expect(search).toBeFocused();
  await library.locator('.card-body').first().click();
  await library.getByRole('button', { name: 'Clear filters' }).click();
  await expect(library.locator('.drawer')).toHaveCount(0);
  await expect(library.locator('.workspace')).not.toHaveClass(/details-open/);
  const unusualId = 'quote"><img src=x data-injected="yes">';
  await api('restore-highlight', { item: { ...highlight, id: unusualId } });
  await library.reload();
  await search.fill('Research article');
  await library.locator('.card-body').first().click();
  await expect(library.locator('[data-injected]')).toHaveCount(0);
  await expect(library.locator('[data-edit]').last()).toHaveAttribute('data-edit', unusualId);
  await library.goto(base + 'library.html#collection=%');
  await expect(library.locator('[data-view=all]')).toHaveAttribute('aria-current', 'page');
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${browserTarget}: pronunciation, translation, research tools, search, resume, highlights view, quote copying, and encrypted restore preview.`,
  );
} finally {
  await context.close();
}
