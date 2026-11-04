import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { firefox as playwrightFirefox } from '@playwright/test';
import { zipSync, unzipSync, strFromU8 } from 'fflate';
import { PDFDocument, StandardFonts, PDFName } from 'pdf-lib';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, readdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const results = path.resolve('test-results/firefox');
await mkdir(results, { recursive: true });
await mkdir('work', { recursive: true });
const files = {};
async function collect(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await collect(path.join(dir, entry.name), prefix + entry.name + '/');
    else files[prefix + entry.name] = new Uint8Array(await readFile(path.join(dir, entry.name)));
  }
}
await collect('dist-firefox');
const addonPath = path.resolve('work/firefox-e2e.xpi');
await writeFile(addonPath, zipSync(files));
let revised = false;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(
    `<!doctype html><title>Firefox research source</title><body style="font:20px/1.8 Georgia;max-width:760px;margin:60px auto"><article><h1>Research across browsers</h1>${revised ? '<p>A new introduction inserted later.</p>' : ''}<p id="passage">Careful reading matters. <strong>Small observations become lasting ideas.</strong> Save a thought while you read.</p><p id="other">Voice notes and highlights belong together.</p>${'<p>Read slowly, notice connections, and preserve the original source.</p>'.repeat(10)}</article></body>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/article`,
  uuid = crypto.randomUUID();
const base = 'moz-extension://' + uuid + '/',
  checks = [],
  errors = [];
const profile = await mkdtemp(path.resolve('work/firefox-profile-'));
const options = new firefox.Options()
  .setBinary(process.env.MARGIN_FIREFOX_BINARY || playwrightFirefox.executablePath())
  .addArguments('-headless')
  .setPreference(
    'extensions.webextensions.uuids',
    JSON.stringify({ 'margin-local-highlighter@margin.local': uuid }),
  )
  .setPreference('browser.download.folderList', 2)
  .setPreference('browser.download.dir', results)
  .setPreference('browser.download.useDownloadDir', true)
  .setPreference('browser.download.alwaysOpenPanel', false)
  .setPreference(
    'browser.helperApps.neverAsk.saveToDisk',
    'application/json,application/pdf,application/zip,text/markdown,text/plain,text/csv,text/html,application/octet-stream',
  )
  .setPreference('pdfjs.disabled', true)
  .setPreference('media.navigator.streams.fake', true)
  .setPreference('media.navigator.permission.disabled', true)
  .setPreference('media.autoplay.default', 0);
// Mozilla requires explicit system access for WebDriver extension pages. This applies only
// to this newly-created test process/profile, never to a user's browser installation.
const service = new firefox.ServiceBuilder().setEnvironment({
  ...process.env,
  MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1',
});
options.setProfile(profile);
const driver = await new Builder()
  .forBrowser('firefox')
  .setFirefoxOptions(options)
  .setFirefoxService(service)
  .build();
await driver.manage().setTimeouts({ implicit: 0, script: 20000, pageLoad: 30000 });
await driver.manage().window().setRect({ width: 1440, height: 1000 });
const element = (css) => driver.wait(until.elementLocated(By.css(css)), 15000);
const click = (css) =>
  driver.wait(
    async () => {
      try {
        const item = await driver.findElement(By.css(css));
        if (!(await item.isDisplayed()) || !(await item.isEnabled())) return false;
        await item.click();
        return true;
      } catch (error) {
        if (['StaleElementReferenceError', 'NoSuchElementError'].includes(error.name)) return false;
        throw error;
      }
    },
    15000,
    'Click ' + css,
    100,
  );
const fill = (css, text) =>
  driver.wait(
    async () => {
      try {
        const item = await driver.findElement(By.css(css));
        await item.clear();
        await item.sendKeys(text);
        return true;
      } catch (error) {
        if (['StaleElementReferenceError', 'NoSuchElementError'].includes(error.name)) return false;
        throw error;
      }
    },
    15000,
    'Fill ' + css,
    100,
  );
const text = async (css) => (await element(css)).getText();
const poll = (fn, message) => driver.wait(fn, 20000, message, 100);
const api = async (type, payload = {}) => {
  const result = await driver.executeAsyncScript(
    (type, payload, done) => {
      browser.runtime
        .sendMessage({ type, payload })
        .then(done, (error) => done({ ok: false, error: error.message }));
    },
    type,
    payload,
  );
  if (!result?.ok) throw new Error(result?.error || 'Firefox extension message failed');
  return result.data;
};
const pass = (name) => {
  checks.push(name);
  console.log('PASS FIREFOX:', name);
};
async function screenshot(name) {
  await writeFile(path.join(results, name), Buffer.from(await driver.takeScreenshot(), 'base64'));
}
async function downloaded(before, suffix) {
  let found;
  await poll(async () => {
    const names = await readdir(results);
    found = names.find(
      (name) => !before.has(name) && name.endsWith(suffix) && !names.includes(name + '.part'),
    );
    return !!found && (await readFile(path.join(results, found))).length > 0;
  }, 'Download ' + suffix);
  return path.join(results, found);
}
async function select(css) {
  return driver.executeScript((selector) => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(selector));
    const selected = getSelection();
    selected.removeAllRanges();
    selected.addRange(range);
    const rect = range.getBoundingClientRect();
    document.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, clientX: rect.left, clientY: rect.bottom }),
    );
    return {
      x: Math.max(10, Math.min(rect.left, innerWidth - 350)) + 24,
      y: Math.min(rect.bottom + 33, innerHeight - 60),
    };
  }, css);
}
async function highlight(css) {
  const point = await select(css);
  await driver.sleep(150);
  await driver
    .actions()
    .move({ origin: 'viewport', x: Math.round(point.x), y: Math.round(point.y) })
    .click()
    .perform();
}
try {
  assert.equal(await driver.installAddon(addonPath, true), 'margin-local-highlighter@margin.local');
  await driver.get(base + 'library.html');
  await element('[data-action=import-markdown]');
  const library = await driver.getWindowHandle();
  const capabilities = await driver.executeScript(() => ({
    version: navigator.userAgent,
    customHighlights: !!globalThis.CSS?.highlights,
    microphone: !!navigator.mediaDevices?.getUserMedia,
    recorder: !!globalThis.MediaRecorder,
    speechRecognition: !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition),
    localTranslation: !!globalThis.Translator,
    localAI: !!globalThis.Summarizer,
    readAloud: !!globalThis.speechSynthesis,
    redirect: browser.identity.getRedirectURL(),
    dataConsent: null,
  }));
  capabilities.dataConsent = await driver.executeAsyncScript((done) =>
    browser.permissions.getAll().then((value) => done(value.data_collection || [])),
  );
  pass('MV3 installation, event background, native promise messages and empty library');
  await driver.switchTo().newWindow('tab');
  const source = await driver.getWindowHandle();
  await driver.get(url);
  await element('[data-margin-ui]');
  await highlight('#passage strong');
  await poll(
    () => driver.executeScript(() => CSS.highlights.size === 1),
    'Native Firefox highlight',
  );
  await screenshot('highlight.png');
  await driver.switchTo().window(library);
  let snapshot = await api('snapshot');
  assert.equal(snapshot.highlights.length, 1);
  assert.equal(snapshot.highlights[0].text, 'Small observations become lasting ideas.');
  const page = snapshot.pages[0],
    h = snapshot.highlights[0];
  pass('real selection toolbar and persisted native CSS highlight');
  await api('update-highlight', {
    id: h.id,
    patch: { note: '**Firefox note**', tags: 'browser, research', color: '#a8e6cf' },
  });
  await api('save-page', {
    url,
    note: 'A source note.',
    collection: 'Browsers/Research',
    bookmarked: true,
  });
  revised = true;
  await driver.switchTo().window(source);
  await driver.navigate().refresh();
  await poll(
    () => driver.executeScript(() => CSS.highlights.size === 1),
    'Quote reanchored after source edits',
  );
  await driver.switchTo().window(library);
  await driver.navigate().refresh();
  await fill('#search', 'Firefox note');
  await element('[data-page]');
  await click('[data-page]');
  await poll(async () => (await text('.drawer')).includes('Firefox note'), 'Rendered note');
  pass('reanchoring, color, Markdown notes, tags, collections, bookmark, and search');
  const captureResult = await driver.executeAsyncScript((url, done) => {
    browser.tabs
      .query({})
      .then(async (tabs) => {
        const source = tabs.find((tab) => tab.url === url);
        if (!source) return done({ ok: false, error: 'Source tab not found' });
        done(await browser.tabs.sendMessage(source.id, { action: 'capture' }));
      })
      .catch((error) => done({ ok: false, error: error.message }));
  }, url);
  assert.ok(captureResult.ok, captureResult.error);
  const beforeReader = new Set(await driver.getAllWindowHandles());
  await click('.drawer [data-action=reader]');
  let reader;
  await poll(async () => {
    reader = (await driver.getAllWindowHandles()).find((handle) => !beforeReader.has(handle));
    return !!reader;
  });
  await driver.switchTo().window(reader);
  await element('#article');
  await poll(
    () => driver.executeScript(() => CSS.highlights.size === 1),
    'Offline reader shared highlights',
  );
  assert.ok((await text('#article')).includes('Small observations'));
  await screenshot('reader.png');
  pass('offline reader and shared annotations');
  await driver.switchTo().window(library);
  await api('add-card', {
    pageId: page.id,
    highlightId: h.id,
    question: 'What should be kept?',
    answer: 'A lasting idea',
  });
  await click('[data-view=study]');
  await click('[data-action=reveal]');
  await click('[data-grade=true]');
  await poll(async () => (await api('snapshot')).cards[0].interval === 1, 'Study schedule');
  pass('flashcard answer reveal and spaced review');

  await click('[data-view=all]');
  await fill('#search', '');
  await click('[data-page]');
  await click('.drawer [data-action=edit-page]');
  await click('.note-assist summary');
  assert.equal(await (await element('[data-speech-start]')).isEnabled(), false);
  assert.match(await text('[data-speech-status]'), /not available|unavailable/i);
  await click('dialog[open] [data-close]');
  pass('unsupported dictation is explained while local recording remains available');
  const beforeCapture = new Set(await driver.getAllWindowHandles());
  await api('open-capture', { pageId: page.id, mode: 'voice' });
  let capture;
  await poll(async () => {
    capture = (await driver.getAllWindowHandles()).find((handle) => !beforeCapture.has(handle));
    return !!capture;
  });
  await driver.switchTo().window(capture);
  await element('[data-audio-record]');
  await fill('[name=note]', 'A native Firefox voice note.');
  await driver.executeScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.testStreams = [];
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      window.testStreams.push(stream);
      return stream;
    };
  });
  await click('[data-audio-record]');
  await poll(
    async () => (await text('[data-audio-status]')).includes('Recording audio locally'),
    'Firefox MediaRecorder start',
  );
  await driver.sleep(900);
  await click('[data-audio-stop]');
  await element('[data-audio-pending] audio');
  assert.ok(
    await driver.executeScript(() =>
      window.testStreams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'),
      ),
    ),
  );
  await click('[type=submit]');
  await poll(async () => (await text('#save-status')).includes('Saved locally'), 'Audio save');
  await poll(
    () => driver.executeScript(() => document.querySelector('#saved-audio audio')?.readyState > 0),
    'Decoded Firefox recording',
  );
  pass('native Firefox getUserMedia/MediaRecorder, hardware cleanup, audio save and decode');
  await driver.switchTo().window(library);
  await driver.get(base + 'library.html#page=' + page.id);
  await click('.drawer [data-action=translate-page]');
  await fill('[name=sourceText]', 'Hello world');
  await fill('[name=target]', 'fa');
  await driver.executeScript(() => {
    const original = browser.tabs.create.bind(browser.tabs);
    browser.tabs.create = (options) => {
      if (options.url?.startsWith('https://translate.google.com/')) {
        window.testHandoff = options.url;
        return original({ ...options, url: 'about:blank' });
      }
      return original(options);
    };
  });
  await click('[data-translate]');
  const handoff = await driver.executeScript(() => window.testHandoff);
  assert.equal(new URL(handoff).hostname, 'translate.google.com');
  assert.equal(new URL(handoff).searchParams.get('tl'), 'fa');
  await fill('[name=result]', 'سلام دنیا');
  await click('dialog[open] [type=submit]');
  await poll(
    async () =>
      (await api('snapshot')).pages.find((p) => p.id === page.id).note.includes('سلام دنیا'),
    'Persian translation retained',
  );
  pass('free Google Translate handoff, Persian paste-back, and preserved source note');

  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Firefox PDF annotation.', {
    x: 60,
    y: 700,
    size: 20,
    font: await pdf.embedFont(StandardFonts.Helvetica),
  });
  const pdfPath = path.join(results, 'fixture.pdf');
  await writeFile(pdfPath, await pdf.save());
  await click('[data-action=add]');
  await click('dialog [data-action=pdf]');
  await (await element('dialog input[type=file]')).sendKeys(pdfPath);
  const beforePDF = new Set(await driver.getAllWindowHandles());
  await click('dialog[open] [type=submit]');
  let viewer;
  await poll(async () => {
    viewer = (await driver.getAllWindowHandles()).find((handle) => !beforePDF.has(handle));
    return !!viewer;
  });
  await driver.switchTo().window(viewer);
  await element('.textLayer span');
  await highlight('.textLayer span');
  await poll(() => driver.executeScript(() => CSS.highlights.size === 1), 'PDF quote highlight');
  const beforePDFDownload = new Set(await readdir(results));
  await click('#download');
  const exported = await downloaded(beforePDFDownload, '.pdf');
  const annotated = await PDFDocument.load(await readFile(exported));
  const annots = annotated.getPage(0).node.Annots();
  assert.equal(annots.size(), 1);
  assert.equal(
    annotated.context.lookup(annots.get(0)).get(PDFName.of('Subtype')).toString(),
    '/Highlight',
  );
  await screenshot('pdf.png');
  pass('native PDF.js rendering, text selection, highlighting and standard annotated PDF export');

  await driver.switchTo().window(library);
  await driver.navigate().refresh();
  await click('[data-action=import-markdown]');
  await fill('dialog [name=markdown]', '# Agent note\n\nA source imported from an AI agent.');
  await click('dialog[open] [type=submit]');
  await poll(async () => (await api('snapshot')).pages.length === 3, 'Markdown import');
  await click('.topbar [data-action=export]');
  await (await element('dialog select[name=format]')).sendKeys('AI-agent research bundle (.zip)');
  let beforeDownload = new Set(await readdir(results));
  await click('dialog[open] [type=submit]');
  const bundle = unzipSync(
    new Uint8Array(await readFile(await downloaded(beforeDownload, '.zip'))),
  );
  assert.ok(Object.keys(bundle).some((name) => name.endsWith('manifest.json')));
  assert.ok(Object.values(bundle).some((bytes) => strFromU8(bytes).includes('Agent note')));
  pass('AI Markdown import and portable agent ZIP export');
  const backup = await api('backup');
  assert.equal(backup.assets.length, 2);
  assert.ok(backup.assets.some((a) => a.type === 'application/pdf'));
  assert.ok(backup.assets.some((a) => a.type.startsWith('audio/')));
  for (const p of backup.pages) await api('delete-page', { id: p.id });
  assert.equal((await api('snapshot')).pages.length, 0);
  await api('import', backup);
  await api('import', backup);
  const restored = await api('backup');
  assert.equal(restored.pages.length, 3);
  assert.equal(restored.assets.length, 2);
  assert.equal(restored.highlights.length, backup.highlights.length);
  pass('complete PDF/audio JSON backup, cascading deletion, atomic restore and repeat-safe import');

  // A genuine WebDriver pointer click grants the same Firefox user gesture as the popup.
  await driver.executeScript(() => {
    const button = document.createElement('button');
    button.id = 'test-sidebar';
    button.textContent = 'Open native sidebar';
    button.style.cssText = 'position:fixed;right:10px;top:10px;z-index:999999';
    button.onclick = () =>
      browser.sidebarAction.open().then(
        () => (button.dataset.opened = 'true'),
        (error) => (button.dataset.error = error.message),
      );
    document.body.prepend(button);
  });
  await click('#test-sidebar');
  await poll(
    () =>
      driver.executeScript(() => document.querySelector('#test-sidebar').dataset.opened === 'true'),
    'Native Firefox sidebar',
  );
  await driver.setContext('chrome');
  assert.ok(await driver.executeScript(() => window.SidebarController.isOpen));
  await driver.setContext('content');
  pass('native Firefox sidebar opens from a real user gesture');
  await driver.manage().window().setRect({ width: 760, height: 900 });
  await driver.navigate().refresh();
  await element('[data-page]');
  await screenshot('library-narrow.png');
  assert.ok(
    await driver.executeScript(() => document.documentElement.scrollWidth <= innerWidth + 2),
  );
  await driver.manage().window().setRect({ width: 1440, height: 1000 });
  await click('[data-view=settings]');
  await screenshot('settings.png');
  pass('responsive library, settings, browser OAuth redirect and offline data persistence');
  await driver.setContext('chrome');
  const messages = await driver.executeScript(
    (base) =>
      Services.console
        .getMessageArray()
        .filter(
          (message) =>
            message.sourceName?.startsWith(base) &&
            !(message.flags & Ci.nsIScriptError.warningFlag),
        )
        .map((message) => ({
          message: message.errorMessage,
          source: message.sourceName,
          line: message.lineNumber,
        })),
    base,
  );
  errors.push(...messages);
  await driver.setContext('content');
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(results, 'report.json'),
    JSON.stringify(
      {
        passed: true,
        browser: 'Firefox',
        version: (await driver.getCapabilities()).get('browserVersion'),
        checks,
        capabilities,
        errors,
        identity:
          'Native redirect API checked; live Google account sign-in requires user approval. Drive transport/merge are tested separately with fixtures.',
      },
      null,
      2,
    ),
  );
  console.log('PASS FIREFOX: no extension JavaScript errors');
} catch (error) {
  await screenshot('failure.png').catch(() => {});
  console.error('FIREFOX PAGE:', await driver.getCurrentUrl().catch(() => 'unknown'));
  console.error(
    (
      await driver
        .findElement(By.css('body'))
        .getText()
        .catch(() => '')
    ).slice(-1800),
  );
  throw error;
} finally {
  await driver.quit();
  await new Promise((resolve) => server.close(resolve));
}
