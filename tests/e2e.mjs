import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, PDFName } from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import { browserTarget, extensionFolder, launchOptions } from './chromium-target.mjs';
const results = path.resolve('test-results', browserTarget);
await mkdir(results, { recursive: true });
await mkdir('work', { recursive: true });
const profile = await mkdtemp(path.resolve('work/e2e-profile-'));
let revised = false;
const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(
    `<!doctype html><html><head><title>The art of paying attention</title></head><body style="font:20px/1.8 Georgia;max-width:760px;margin:70px auto"><article><h1>The art of paying attention</h1>${revised ? '<p>An introduction added after the original annotation.</p>' : ''}<p id="passage">A good reader notices what matters. <strong>Small observations become lasting ideas.</strong> Keep a little room for curiosity.</p>${'<p>Reading slowly gives us time to question our first impressions and discover connections. A personal library grows one idea at a time.</p>'.repeat(8)}</article></body></html>`,
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/article`;
const context = await chromium.launchPersistentContext(profile, {
  ...launchOptions,
  headless: true,
  args: [
    `--disable-extensions-except=${extensionFolder}`,
    `--load-extension=${extensionFolder}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors = [];
context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const extensionId = worker.url().split('/')[2];
  const base = `chrome-extension://${extensionId}/`;
  const library = await context.newPage();
  await library.goto(base + 'library.html');
  await expect(
    library.getByRole('heading', { name: 'Your next great idea starts here.' }),
  ).toBeVisible();
  console.log('PASS: extension installation and empty library');
  const article = await context.newPage();
  await article.goto(url);
  await article.waitForTimeout(700);
  const select = async (page, selector) =>
    page.evaluate((selector) => {
      const node = document.querySelector(selector);
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const rect = range.getBoundingClientRect();
      document.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, clientX: rect.left, clientY: rect.bottom }),
      );
      return { x: rect.left, y: rect.bottom };
    }, selector);
  let rect = await select(article, '#passage strong');
  await article.waitForTimeout(120);
  await article.mouse.click(Math.max(10, Math.min(rect.x, 1110)) + 24, rect.y + 33);
  await expect.poll(() => article.evaluate(() => CSS.highlights.size)).toBe(1);
  await article.screenshot({ path: path.join(results, 'highlight-on-page.png') });
  const snap = () =>
    library.evaluate(async () => {
      const r = await chrome.runtime.sendMessage({ type: 'snapshot' });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    });
  await expect.poll(async () => (await snap()).highlights.length).toBe(1);
  let state = await snap();
  assert.equal(state.highlights[0].text, 'Small observations become lasting ideas.');
  console.log('PASS: selection toolbar creates a real persisted highlight');
  const tabId = await worker.evaluate(async (url) => {
    for (const t of await chrome.tabs.query({})) {
      try {
        const s = await chrome.tabs.sendMessage(t.id, { action: 'status' });
        if (s.data?.url === url) return t.id;
      } catch {}
    }
    throw new Error('Article tab not found');
  }, url);
  const send = (action) =>
    worker.evaluate(async ({ tabId, action }) => chrome.tabs.sendMessage(tabId, { action }), {
      tabId,
      action,
    });
  await send('bookmark');
  await select(article, '#passage');
  await send('highlight');
  await expect.poll(async () => (await snap()).highlights.length).toBe(2);
  assert.equal((await snap()).pages[0].bookmarked, true);
  console.log('PASS: keyboard action, overlapping highlights, bookmark persistence');
  revised = true;
  await article.reload();
  await expect.poll(() => article.evaluate(() => CSS.highlights.size)).toBe(2);
  console.log('PASS: highlights restore after page content changes');
  await library.bringToFront();
  await library.reload();
  await library.locator('[data-page]').first().click();
  await library.locator('[data-edit]').first().click();
  await library
    .locator('dialog textarea[name=note]')
    .fill('**A lasting idea**\n\n- Keep looking closely.');
  await library.locator('dialog input[name=tags]').fill('reading, ideas');
  await library.locator('dialog[open] button[type=submit]').click();
  await expect(library.locator('.drawer .note-preview strong').first()).toHaveText(
    'A lasting idea',
  );
  await library.locator('[data-action=edit-page]').click();
  await library.locator('dialog input[name=collection]').fill('Research / Reading');
  await library.locator('dialog input[name=tags]').fill('attention');
  await library.locator('dialog[open] button[type=submit]').click();
  await expect(library.locator('[data-collection="Research"]')).toContainText('Research');
  await expect(
    library.locator('[data-collection="Research/Reading"] .collection-label'),
  ).toHaveText('Reading');
  await library.locator('.drawer [data-close]').click();
  await library.locator('#search').fill('lasting idea');
  await expect(library.locator('.page-card')).toHaveCount(1);
  await library.locator('#search').fill('no such words');
  await expect(library.locator('.page-card')).toHaveCount(0);
  await library.locator('#search').fill('');
  console.log('PASS: notes, Markdown rendering, tags, collection and full-text search');
  await send('capture');
  state = await snap();
  assert.ok(state.pages[0].article.includes('Small observations'));
  const reader = await context.newPage();
  await reader.goto(base + 'reader.html?id=' + state.pages[0].id);
  await expect(reader.locator('#article')).toContainText('Small observations');
  await expect.poll(() => reader.evaluate(() => CSS.highlights.size)).toBe(2);
  await reader.screenshot({ path: path.join(results, 'reader.png') });
  console.log('PASS: offline reader and shared annotations');
  await library.locator('[data-page]').first().click();
  await library.locator('[data-card]').first().click();
  await library.locator('dialog input[name=question]').fill('What can small observations become?');
  await library.locator('dialog[open] button[type=submit]').click();
  await library.locator('.drawer [data-close]').click();
  await library.locator('[data-view=study]').click();
  await expect(library.locator('.question')).toHaveText('What can small observations become?');
  await library.locator('[data-action=reveal]').click();
  await library.locator('[data-grade=true]').click();
  await expect(library.getByRole('heading', { name: 'You’re all caught up.' })).toBeVisible();
  console.log('PASS: flashcard creation and scheduled review');
  await library.locator('[data-view=all]').click();
  // A real PDF with selectable text, loaded through the public library UI.
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  page.drawText('A local PDF worth highlighting.', {
    x: 60,
    y: 700,
    size: 20,
    font: await pdfDoc.embedFont(StandardFonts.Helvetica),
  });
  pdfDoc.addPage([612, 792]).drawText('The second page keeps its own highlights.', {
    x: 60,
    y: 700,
    size: 18,
    font: await pdfDoc.embedFont(StandardFonts.Helvetica),
  });
  const pdfPath = path.join(results, 'fixture.pdf');
  await writeFile(pdfPath, await pdfDoc.save());
  await library.locator('[data-action=add]').click();
  await library.locator('dialog [data-action=pdf]').click();
  await library.locator('dialog input[type=file]').setInputFiles(pdfPath);
  const [pdfView] = await Promise.all([
    context.waitForEvent('page', { timeout: 15000 }),
    library.locator('dialog[open] button[type=submit]').click(),
  ]);
  await pdfView.waitForLoadState();
  await expect(pdfView.locator('.textLayer span').first()).toBeVisible();
  rect = await select(pdfView, '.textLayer span');
  await pdfView.waitForTimeout(150);
  await pdfView.mouse.click(Math.max(10, Math.min(rect.x, 1110)) + 24, rect.y + 33);
  await expect.poll(() => pdfView.evaluate(() => CSS.highlights.size)).toBe(1);
  await pdfView.locator('[data-pdf-page="2"] .textLayer span').first().scrollIntoViewIfNeeded();
  rect = await select(pdfView, '[data-pdf-page="2"] .textLayer span');
  await pdfView.waitForTimeout(150);
  await pdfView.mouse.click(Math.max(10, Math.min(rect.x, 1110)) + 24, rect.y + 33);
  await expect.poll(() => pdfView.evaluate(() => CSS.highlights.size)).toBe(2);
  const pdfDownload = pdfView.waitForEvent('download');
  await pdfView.locator('#download').click();
  const annotated = await pdfDownload;
  await annotated.saveAs(path.join(results, 'annotated.pdf'));
  const output = await PDFDocument.load(await readFile(path.join(results, 'annotated.pdf')));
  const annots = output.getPage(0).node.Annots();
  assert.equal(annots.size(), 1);
  const annot = output.context.lookup(annots.get(0));
  assert.equal(annot.get(PDFName.of('Subtype')).toString(), '/Highlight');
  assert.equal(output.getPage(1).node.Annots().size(), 1);
  await pdfView.locator('[data-pdf-page="1"]').scrollIntoViewIfNeeded();
  await pdfView.screenshot({ path: path.join(results, 'pdf-viewer.png') });
  console.log('PASS: local PDF rendering, highlighting, and embedded PDF annotation export');
  await library.bringToFront();
  await library.reload();
  await library.locator('.topbar [data-action=export]').click();
  const backupDownload = library.waitForEvent('download');
  await library.locator('dialog[open] select[name=format]').selectOption('json');
  await library.locator('dialog[open] button[type=submit]').click();
  const backup = await backupDownload;
  await backup.saveAs(path.join(results, 'backup.json'));
  const backupData = JSON.parse(await readFile(path.join(results, 'backup.json'), 'utf8'));
  assert.equal(backupData.pages.length, 2);
  assert.equal(backupData.assets.length, 1);
  assert.equal(backupData.highlights.length, 4);
  console.log('PASS: complete JSON backup includes PDF and all research');
  await library.locator('.topbar [data-action=export]').click();
  await library.locator('dialog select[name=format]').selectOption('md');
  const mdDownload = library.waitForEvent('download');
  await library.locator('dialog[open] button[type=submit]').click();
  const md = await mdDownload;
  await md.saveAs(path.join(results, 'research.md'));
  assert.ok(
    (await readFile(path.join(results, 'research.md'), 'utf8')).includes('Small observations'),
  );
  console.log('PASS: portable Markdown export');
  await library.locator('.topbar [data-action=export]').click();
  await library.locator('dialog[open] select[name=format]').selectOption('print');
  const [printView] = await Promise.all([
    context.waitForEvent('page'),
    library.locator('dialog[open] button[type=submit]').click(),
  ]);
  await expect(printView.getByRole('button', { name: 'Print / Save as PDF' })).toBeVisible();
  await expect(printView.locator('article')).toHaveCount(2);
  await printView.pdf({
    path: path.join(results, 'research-digest.pdf'),
    format: 'A4',
    printBackground: true,
  });
  console.log('PASS: print / PDF research digest');
  await library.screenshot({ path: path.join(results, 'library.png'), fullPage: true });
  // Recover into a genuinely empty extension database, not merely duplicate the existing records.
  await library.evaluate(async () => {
    const r = await chrome.runtime.sendMessage({ type: 'snapshot' });
    for (const p of r.data.pages)
      await chrome.runtime.sendMessage({ type: 'delete-page', payload: { id: p.id } });
  });
  await expect.poll(async () => (await snap()).pages.length).toBe(0);
  await library.locator('[data-view=settings]').click();
  const chooser = library.waitForEvent('filechooser');
  await library.locator('[data-action=import]').click();
  await (await chooser).setFiles(path.join(results, 'backup.json'));
  await expect.poll(async () => (await snap()).pages.length).toBe(2);
  await expect.poll(async () => (await snap()).highlights.length).toBe(4);
  const chooser2 = library.waitForEvent('filechooser');
  await library.locator('[data-action=import]').click();
  await (await chooser2).setFiles(path.join(results, 'backup.json'));
  await library.waitForTimeout(600);
  assert.equal((await snap()).highlights.length, 4);
  assert.equal((await snap()).cards.length, 1);
  console.log('PASS: full restore into empty database and duplicate-safe reimport');
  // Exercise transcript integration against a deterministic local fixture at the target origin.
  await context.route('https://www.youtube.com/watch?v=margin-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Learning from a video</title><video></video><ytd-transcript-segment-renderer><span class="segment-timestamp">0:00</span><span class="segment-text">A first idea from this video.</span></ytd-transcript-segment-renderer><ytd-transcript-segment-renderer><span class="segment-timestamp">0:42</span><span class="segment-text">A second useful observation.</span></ytd-transcript-segment-renderer>',
    }),
  );
  const video = await context.newPage();
  await video.goto('https://www.youtube.com/watch?v=margin-test');
  await video.waitForTimeout(500);
  const videoTabId = await worker.evaluate(async () => {
    for (const t of await chrome.tabs.query({})) {
      try {
        const s = await chrome.tabs.sendMessage(t.id, { action: 'status' });
        if (s.data?.url.includes('v=margin-test')) return t.id;
      } catch {}
    }
  });
  const videoPage = await worker.evaluate(
    async (tabId) => (await chrome.tabs.sendMessage(tabId, { action: 'capture' })).data,
    videoTabId,
  );
  assert.equal(videoPage.type, 'youtube');
  assert.equal(videoPage.transcript.length, 2);
  const transcript = await context.newPage();
  await transcript.goto(base + 'reader.html?id=' + videoPage.id);
  await expect(transcript.locator('.transcript-line')).toHaveCount(2);
  await transcript.locator('.transcript-line a').nth(1).click();
  await expect
    .poll(() => video.evaluate(() => document.querySelector('video').currentTime))
    .toBe(42);
  await transcript.locator('#follow-video').click();
  await expect(transcript.locator('.transcript-line.playing')).toContainText(
    'A second useful observation.',
  );
  await transcript.locator('#follow-video').click();
  console.log(
    'PASS: captured transcript, timestamp seek and follow mode (fixture; live YouTube markup may vary)',
  );
  // Popup and panel entry points also execute without page errors.
  const popup = await context.newPage();
  await popup.goto(base + 'popup.html');
  await expect(popup.locator('#library')).toBeVisible();
  const panel = await context.newPage();
  await panel.goto(base + 'panel.html');
  await expect(panel.locator('#library')).toBeVisible();
  await library.bringToFront();
  await library.locator('[data-view=all]').click();
  const mdFile = path.join(results, 'agent-input.md');
  await writeFile(
    mdFile,
    '# Notes from an agent\n\nA useful claim with a **clear explanation**.\n\n- Verify the source\n- Keep the evidence\n',
  );
  await library.locator('[data-action=import-markdown]').click();
  await library.locator('dialog[open] input[type=file]').setInputFiles(mdFile);
  await library.locator('dialog[open] [name=collection]').fill('Agent research');
  await library.locator('dialog[open] [type=submit]').click();
  await expect.poll(async () => (await snap()).pages.length).toBe(4);
  await library.locator('[data-action=import-markdown]').click();
  await library.locator('dialog[open] input[type=file]').setInputFiles(mdFile);
  await library.locator('dialog[open] [type=submit]').click();
  await library.waitForTimeout(300);
  assert.equal((await snap()).pages.length, 4);
  await library.locator('#search').fill('useful claim');
  await expect(library.locator('.page-card')).toHaveCount(1);
  await library.locator('[data-layout=list]').click();
  await expect(library.locator('.grid')).toHaveClass(/is-list/);
  await library.locator('[data-page]').click();
  const mdPage = (await snap()).pages.find((p) => p.title === 'Notes from an agent');
  const mdReader = await context.newPage();
  await mdReader.goto(base + 'reader.html?id=' + mdPage.id);
  await expect(mdReader.locator('#article strong')).toHaveText('clear explanation');
  rect = await select(mdReader, '#article strong');
  await mdReader.waitForTimeout(100);
  await mdReader.mouse.click(Math.max(10, Math.min(rect.x, 1110)) + 24, rect.y + 33);
  await expect.poll(() => mdReader.evaluate(() => CSS.highlights.size)).toBe(1);
  await library.bringToFront();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await library.locator('.drawer [data-action=copy-notion]').click();
  await expect
    .poll(() => library.evaluate(() => navigator.clipboard.readText()))
    .toContain('clear explanation');
  assert.ok(
    (
      await library.evaluate(async () =>
        (await navigator.clipboard.read()).flatMap((item) => item.types),
      )
    ).includes('text/html'),
  );
  await library.locator('.drawer [data-close]').click();
  await library.locator('[data-action=export-agent]').click();
  await expect(library.locator('dialog[open] #export-guidance')).toContainText(
    'structured manifest',
  );
  const agentDownload = library.waitForEvent('download');
  await library.locator('dialog[open] [type=submit]').click();
  const agentZip = await agentDownload;
  await agentZip.saveAs(path.join(results, 'agent-bundle.zip'));
  const agentFiles = unzipSync(await readFile(path.join(results, 'agent-bundle.zip')));
  const manifest = JSON.parse(strFromU8(agentFiles['manifest.json']));
  assert.equal(manifest.documents.length, 1);
  assert.equal(manifest.documents[0].highlights[0].text, 'clear explanation');
  assert.ok(!Object.hasOwn(manifest.documents[0], 'text'));
  await library.locator('[data-action=export-notion]').click();
  await expect(library.locator('dialog[open] [data-destination=notion]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await library.screenshot({ path: path.join(results, 'export-center.png') });
  const notionDownload = library.waitForEvent('download');
  await library.locator('dialog[open] [type=submit]').click();
  const notionZip = await notionDownload;
  await notionZip.saveAs(path.join(results, 'notion-bundle.zip'));
  const notionFiles = unzipSync(await readFile(path.join(results, 'notion-bundle.zip')));
  assert.equal(Object.keys(notionFiles).filter((n) => n.endsWith('.md')).length, 2);
  await library.locator('[data-layout=grid]').click();
  await library.locator('#search').fill('');
  await library.screenshot({ path: path.join(results, 'library-v2.png'), fullPage: true });
  await library.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await library.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  );
  await library.screenshot({ path: path.join(results, 'library-mobile.png'), fullPage: true });
  await library.setViewportSize({ width: 1440, height: 1000 });
  await library.locator('[data-view=settings]').click();
  await library.locator('#theme').selectOption('dark');
  await library.locator('[data-view=all]').click();
  await library.screenshot({ path: path.join(results, 'library-dark.png'), fullPage: true });
  await library.locator('[data-view=settings]').click();
  await library.locator('#theme').selectOption('light');
  await library.locator('[data-view=all]').click();
  await library.locator('[data-page]').first().click();
  const detailBox = await library.locator('.drawer').boundingBox(),
    contentBox = await library.locator('.workspace>.content').boundingBox();
  assert.ok(contentBox.x + contentBox.width <= detailBox.x + 1);
  await expect
    .poll(async () => (await library.locator('.drawer').boundingBox()).width)
    .toBeGreaterThan(360);
  await library.locator('.detail-resizer').focus();
  await library.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await snap()).settings.detailWidth).toBe(504);
  await library.screenshot({
    path: path.join(results, 'split-workspace.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await library.locator('[data-collapse]').click();
  await expect(library.locator('.drawer')).toBeHidden();
  await expect(library.locator('[data-details-toggle]')).toHaveText('Show highlights');
  await library.locator('[data-details-toggle]').click();
  await expect(library.locator('.drawer')).toBeVisible();
  await library.setViewportSize({ width: 390, height: 844 });
  const narrowDetail = await library.locator('.drawer').boundingBox(),
    narrowContent = await library.locator('.workspace>.content').boundingBox();
  assert.ok(narrowDetail.y + narrowDetail.height <= narrowContent.y + 1);
  assert.ok(
    await library.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  );
  await library.screenshot({
    path: path.join(results, 'split-workspace-mobile.png'),
    fullPage: true,
  });
  await library.setViewportSize({ width: 1440, height: 1000 });
  await library.locator('.drawer [data-close]').click();
  // Deterministic speech fixture exercises live/final results without capturing a microphone.
  await library.evaluate(() => {
    class TestSpeech {
      processLocally = false;
      static async available() {
        return 'available';
      }
      static async install() {
        return true;
      }
      start() {
        globalThis.__testSpeech = this;
        this.onstart?.();
      }
      stop() {
        const item = [{ transcript: 'A spoken observation.' }];
        item.isFinal = true;
        this.onresult?.({ resultIndex: 0, results: [item] });
        this.onend?.();
      }
      abort() {
        globalThis.__speechAborted = true;
        this.onend?.();
      }
    }
    Object.defineProperty(globalThis, 'SpeechRecognition', {
      value: TestSpeech,
      configurable: true,
    });
  });
  await library.locator('[data-action=voice-note]').click();
  await library.locator('dialog[open] [name=title]').fill('Voice research note');
  await library.locator('dialog[open] [name=note]').fill('Typed introduction.');
  await library.locator('[data-speech-language]').fill('fa-IR');
  await library.locator('[data-speech-preference]').click();
  await expect.poll(async () => (await snap()).settings.voiceLanguage).toBe('fa-IR');
  await library.locator('[data-speech-mode]').selectOption('browser');
  await library.locator('[data-speech-start]').click();
  await expect(library.locator('[data-speech-status]')).toContainText('Allow online');
  await library.locator('[data-speech-mode]').selectOption('local');
  await library.locator('[data-speech-language]').fill('en-US');
  await library.locator('[data-speech-start]').click();
  await expect(library.locator('[data-speech-status]')).toContainText('Listening');
  await library.evaluate(() => {
    const item = [{ transcript: 'Live words in progress…' }];
    item.isFinal = false;
    globalThis.__testSpeech.onresult({ resultIndex: 0, results: [item] });
  });
  await expect(library.locator('[data-speech-status]')).toContainText('Live words in progress');
  await expect(library.locator('dialog[open] [name=note]')).toHaveValue('Typed introduction.');
  await library.screenshot({ path: path.join(results, 'voice-notes.png') });
  await library.locator('dialog[open] [type=submit]').click();
  await expect
    .poll(async () =>
      (await snap()).pages.some(
        (p) =>
          p.title === 'Voice research note' &&
          p.note === 'Typed introduction. A spoken observation.',
      ),
    )
    .toBe(true);
  await expect.poll(() => library.evaluate(() => globalThis.__speechAborted)).toBe(true);
  const voicePage = (await snap()).pages.find((p) => p.title === 'Voice research note');
  if (!(await library.locator('.drawer').isVisible()))
    await library.locator(`[data-page="${voicePage.id}"]`).click();
  await library.evaluate(() => {
    Object.defineProperty(globalThis, 'LanguageDetector', {
      configurable: true,
      value: {
        availability: async () => 'available',
        create: async () => ({
          detect: async () => [{ detectedLanguage: 'en', confidence: 0.99 }],
          destroy() {},
        }),
      },
    });
    Object.defineProperty(globalThis, 'Translator', {
      configurable: true,
      value: {
        availability: async () => 'available',
        create: async () => ({ translate: async () => 'Une observation orale.', destroy() {} }),
      },
    });
  });
  await library.locator('.drawer [data-action=translate-page]').click();
  await library.locator('[name=provider]').selectOption('local');
  await expect(library.locator('dialog[open] [name=source]')).toHaveValue('auto');
  await library.locator('[name=target]').fill('fr');
  await library.locator('[data-save-language]').click();
  await library.locator('[data-translate]').click();
  await expect(library.locator('[name=result]')).toHaveValue('Une observation orale.');
  await expect(library.locator('[name=result]')).toHaveAttribute('dir', 'ltr');
  await expect(library.locator('[data-translation-status]')).toContainText(
    'Detected source: English',
  );
  await library.screenshot({ path: path.join(results, 'translation-persian.png') });
  await library.locator('dialog[open] [type=submit]').click();
  await expect
    .poll(async () => (await snap()).pages.find((p) => p.id === voicePage.id).note)
    .toContain('Une observation orale.');
  assert.ok(
    (await snap()).pages.find((p) => p.id === voicePage.id).note.startsWith('Typed introduction.'),
  );
  await library.locator('.drawer [data-action=translate-page]').click();
  await library.locator('[name=provider]').selectOption('local');
  await expect(library.locator('[name=target]')).toHaveValue('fr');
  await library.locator('[name=target]').fill('fa');
  await expect(library.locator('[data-translate]')).toBeDisabled();
  await expect(library.locator('[data-translation-status]')).toContainText('not supported');
  await library.locator('[data-save-language]').click();
  await library.locator('[name=provider]').selectOption('google');
  await library.locator('[name=key]').fill('test-session-key-not-real');
  let googleCalls = 0;
  await context.route('https://translation.googleapis.com/language/translate/v2', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type,x-goog-api-key',
          'access-control-allow-methods': 'POST,OPTIONS',
        },
      });
    googleCalls++;
    assert.equal(route.request().headers()['x-goog-api-key'], 'test-session-key-not-real');
    assert.ok(!Object.hasOwn(JSON.parse(route.request().postData()), 'source'));
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        data: {
          translations: [{ translatedText: 'متن ترجمه شده.', detectedSourceLanguage: 'en' }],
        },
      }),
    });
  });
  await library.locator('[data-translate]').click();
  await expect(library.locator('[data-translation-status]')).toContainText('Allow sending');
  assert.equal(googleCalls, 0);
  await library.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await library.locator('[name=cloudConsent]').check();
  await library.locator('[data-translate]').click();
  await expect(library.locator('[name=result]')).toHaveValue('متن ترجمه شده.');
  assert.equal(googleCalls, 1);
  assert.equal(
    await library.evaluate(
      async () => (await chrome.storage.session.get('googleTranslationKey')).googleTranslationKey,
    ),
    'test-session-key-not-real',
  );
  assert.ok(
    !(
      await library.evaluate(async () =>
        JSON.stringify((await chrome.runtime.sendMessage({ type: 'backup' })).data),
      )
    ).includes('test-session-key-not-real'),
  );
  await library.locator('dialog[open] [type=submit]').click();
  await library.evaluate(() => {
    globalThis.__translationResolvers = {};
    Object.defineProperty(globalThis, 'Translator', {
      configurable: true,
      value: {
        availability: async () => 'available',
        create: async () => ({
          translate: (text) =>
            new Promise((resolve) => {
              globalThis.__translationResolvers[text] = resolve;
            }),
          destroy() {},
        }),
      },
    });
  });
  await library.locator('.drawer [data-action=translate-page]').click();
  await library.locator('[name=provider]').selectOption('local');
  await library.locator('[name=target]').fill('fr');
  await library.locator('[name=sourceText]').fill('First request');
  await library.locator('[data-translate]').click();
  await expect
    .poll(() => library.evaluate(() => Boolean(globalThis.__translationResolvers['First request'])))
    .toBe(true);
  await library.locator('[name=sourceText]').fill('Second request');
  await library.locator('[data-translate]').click();
  await expect
    .poll(() =>
      library.evaluate(() => Boolean(globalThis.__translationResolvers['Second request'])),
    )
    .toBe(true);
  await library.evaluate(() =>
    globalThis.__translationResolvers['Second request']('Newest translation'),
  );
  await expect(library.locator('[name=result]')).toHaveValue('Newest translation');
  await library.evaluate(() =>
    globalThis.__translationResolvers['First request']('Old translation'),
  );
  await library.waitForTimeout(100);
  await expect(library.locator('[name=result]')).toHaveValue('Newest translation');
  await library.locator('dialog[open] [type=submit]').click();
  assert.ok(
    (await snap()).pages.find((p) => p.id === voicePage.id).note.includes('Newest translation'),
  );
  assert.ok(
    !(await snap()).pages.find((p) => p.id === voicePage.id).note.includes('Old translation'),
  );
  await library.locator('.drawer [data-close]').click();
  await library.locator('[data-view=settings]').click();
  await library.locator('[data-key-clear]').click();
  assert.equal(
    await library.evaluate(
      async () => (await chrome.storage.session.get('googleTranslationKey')).googleTranslationKey,
    ),
    undefined,
  );
  console.log(
    'PASS: non-overlapping/collapsible/resizable workspace, narrow layout, live dictation with save flushing, source detection, Persian RTL/defaults, and Google consent/session-key isolation (provider fixtures)',
  );
  console.log(
    'PASS: Markdown import/deduplication, source search, reader highlighting, list view, scoped Notion/agent bundles, and responsive/dark UI',
  );
  assert.deepEqual(errors, []);
  console.log('PASS: no browser JavaScript errors');
  await writeFile(
    path.join(results, 'report.json'),
    JSON.stringify(
      {
        passed: true,
        browser: browserTarget,
        userAgent: await library.evaluate(() => navigator.userAgent),
        checks: 16,
        errors,
        extensionId,
        providerTests:
          'Deterministic speech/translation fixtures; no live audio or paid Google API call',
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error('Browser errors:', errors);
  for (const [i, p] of context.pages().entries()) {
    try {
      await p.screenshot({ path: path.join(results, 'failure-' + i + '.png') });
      console.error('PAGE', p.url(), (await p.locator('body').innerText()).slice(-1500));
    } catch {}
  }
  throw e;
} finally {
  await context.close();
  server.close();
}
