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
context.on('page', (page) =>
  page.on('pageerror', (error) => errors.push(`${page.url()}\n${error.stack || error.message}`)),
);
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
    synth.speaking = false;
    synth.pending = false;
    synth.speak = (utterance) => {
      globalThis.spokenSelections.push([utterance.text, utterance.voice.voiceURI]);
      globalThis.currentSpeech = utterance;
      synth.speaking = true;
      utterance.onstart?.();
    };
    synth.cancel = () => {
      synth.speaking = false;
    };
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
  await reader.evaluate(async () => {
    getSelection().anchorNode.parentElement.scrollIntoView({
      block: 'center',
      behavior: 'instant',
    });
    await new Promise((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
    );
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
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
  const stopSpeech = toolbar.getByRole('button', { name: 'Stop', exact: true });
  const repeatSpeech = toolbar.getByRole('button', { name: 'Repeat', exact: true });
  const speechStatus = toolbar.locator('.selection-speech [role=status]');
  await expect(stopSpeech).toBeEnabled();
  const playbackSize = await stopSpeech.boundingBox();
  await expect(repeatSpeech).toHaveCount(0);
  await reader.evaluate(() => {
    globalThis.speechSynthesis.speaking = false;
  });
  await expect(speechStatus).toHaveText('Pronunciation finished.');
  await expect(stopSpeech).toHaveCount(0);
  assert.equal((await repeatSpeech.boundingBox()).width, playbackSize.width);
  await repeatSpeech.focus();
  await repeatSpeech.press('Enter');
  await expect
    .poll(() => reader.evaluate(() => globalThis.spokenSelections.slice(-2)))
    .toEqual([
      ['ReaderNeedle', 'uk'],
      ['ReaderNeedle', 'uk'],
    ]);
  await expect(stopSpeech).toBeEnabled();
  await reader.evaluate(() => {
    globalThis.speechSynthesis.speaking = false;
    globalThis.currentSpeech.onend();
  });
  await expect(speechStatus).toHaveText('Pronunciation finished.');
  await expect(stopSpeech).toHaveCount(0);
  await expect(repeatSpeech).toBeFocused();
  await repeatSpeech.press('Enter');
  await stopSpeech.press('Enter');
  await expect(speechStatus).toHaveText('Stopped.');
  await expect(stopSpeech).toHaveCount(0);
  await expect(repeatSpeech).toBeFocused();
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
  await reader.evaluate(() => {
    const paragraph = document.querySelector('#article p');
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
  await expect(toolbar.getByLabel('Pronunciation voice')).toHaveValue('uk');
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
  await library.reload();
  await expect(library.locator('[data-view=all]')).toHaveAttribute('aria-current', 'page');
  await library.setViewportSize({ width: 390, height: 844 });
  const resumeLink = recent.getByRole('link').first();
  await expect(resumeLink).toBeVisible();
  const stacked = await resumeLink.evaluate(
    (link) =>
      link.querySelector('strong').getBoundingClientRect().bottom <=
      link.querySelector('small').getBoundingClientRect().top,
  );
  assert.equal(
    stacked,
    true,
    'Continue-reading title and progress should stack on a narrow screen',
  );

  await library.setViewportSize({ width: 1280, height: 720 });
  await search.fill('Research article');
  await library.locator('.card-body').first().click();
  await library.getByRole('button', { name: 'Edit page', exact: true }).click();
  const editor = library.getByRole('dialog');
  const note = editor.locator('textarea[name=note]');
  const prose = '😀 This is a example.';
  const protectedText =
    '\n\n> This is a example.\n\n`This is a example.`\n\n“This is a example.”\n\nhttps://example.test/a-example\n\nاین یک نمونه است.';
  await note.fill(prose + protectedText);
  await context.setOffline(true);
  await editor.getByText('Proofread note · English', { exact: true }).click();
  const replacement = editor.getByRole('button', { name: 'Apply “an”', exact: true });
  await expect(replacement).toHaveCount(1, { timeout: 20000 });
  await expect(note).toHaveValue(prose + protectedText);
  await replacement.locator('xpath=../..').locator('button').first().click();
  await expect
    .poll(() =>
      note.evaluate((field) => field.value.slice(field.selectionStart, field.selectionEnd)),
    )
    .toBe('a');
  await replacement.click();
  await expect(note).toHaveValue('😀 This is an example.' + protectedText);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();

  const [capture] = await Promise.all([
    context.waitForEvent('page'),
    api('open-capture', { pageId: source.id }),
  ]);
  const draft = capture.locator('textarea[name=note]');
  await draft.fill('This is a example.');
  await capture.getByText('Proofread note · English', { exact: true }).click();
  const correction = capture.getByRole('button', { name: 'Apply “an”', exact: true });
  await expect(correction).toBeVisible({ timeout: 20000 });
  await correction.locator('xpath=..').getByRole('button', { name: 'Ignore', exact: true }).click();
  await expect(correction).toHaveCount(0);
  await expect(draft).toHaveValue('This is a example.');
  await capture.getByRole('button', { name: 'Save note & audio' }).click();
  await expect(draft).toHaveValue('');
  await expect(capture.locator('[data-proofread-issues] li')).toHaveCount(0);
  await capture.close();
  await context.setOffline(false);
  const discovery = await api('save-page', {
    url: 'https://example.test/discovery',
    title: 'Discovery source',
  });
  const related = await api('add-highlight', {
    pageId: discovery.id,
    text: 'Coastal wetlands protect migratory birds.',
    anchor: { exact: 'Coastal wetlands protect migratory birds.' },
    color: '#ffe08a',
    tags: ['discovery-test'],
  });
  await api('add-highlight', {
    pageId: source.id,
    text: 'Restoring wetlands supports migratory species.',
    anchor: { exact: 'Restoring wetlands supports migratory species.' },
    color: '#ffe08a',
  });
  await api('add-highlight', {
    pageId: source.id,
    text: 'A separate observation from this study.',
    anchor: { exact: 'A separate observation from this study.' },
    color: '#ffe08a',
    tags: ['discovery-test'],
  });
  await library.locator('[data-view="highlights"]').click();
  await search.fill('Coastal');
  await library.getByLabel('Filter by tag').selectOption('discovery-test');
  await library.getByLabel('Sort pages').selectOption('oldest');
  await library.getByRole('button', { name: 'Save search', exact: true }).click();
  await library.getByRole('dialog').getByLabel('Name').fill('Wetland research');
  await library.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(library.getByText('Search saved.')).toBeVisible();
  await library.goto(base + 'library.html#all');
  await library.reload();
  await library.getByRole('button', { name: 'Saved searches', exact: true }).click();
  await expect(library.getByRole('dialog').locator('option:checked')).toHaveText(
    'Wetland research',
  );
  await library.getByRole('button', { name: 'Open search', exact: true }).click();
  await expect(search).toHaveValue('Coastal');
  await expect(library.getByLabel('Filter by tag')).toHaveValue('discovery-test');
  await expect(library.getByLabel('Sort pages')).toHaveValue('oldest');
  await expect(library.locator('.library-highlight')).toHaveCount(1);
  await library.locator(`[data-related-highlight="${related.id}"]`).click();
  const relatedDialog = library.getByRole('dialog');
  const wordMatch = relatedDialog.locator('li').filter({
    hasText: 'Shared words: wetlands, migratory',
  });
  await expect(wordMatch).toBeVisible();
  await expect(relatedDialog.locator('li').first()).toContainText('Shared tags: discovery-test');
  await expect(relatedDialog.getByText('Coastal wetlands protect migratory birds.')).toHaveCount(0);
  await wordMatch.getByRole('button', { name: 'Open highlight' }).click();
  await expect(library.locator('.drawer [data-annotation]:focus')).toContainText(
    'Restoring wetlands supports migratory species.',
  );
  await library.getByRole('button', { name: 'Saved searches', exact: true }).click();
  await library.getByRole('button', { name: 'Remove selected search' }).click();
  await expect(library.getByRole('dialog').getByRole('status')).toHaveText(
    'No saved searches left.',
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${browserTarget}: research tools, search, saved searches, related highlights, resume, encrypted restore preview, and offline proofreading.`,
  );
} finally {
  await context.close();
}
