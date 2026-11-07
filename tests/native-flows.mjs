import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserTarget, extensionFolder, launchOptions } from './chromium-target.mjs';
import { scratchDirectory } from '../scripts/scratch-directory.mjs';
const results = path.resolve('test-results', browserTarget, 'native');
await using scratch = await scratchDirectory('test-audio');
await mkdir(results, { recursive: true });
const rate = 16000,
  length = rate * 2,
  wav = Buffer.alloc(44 + length * 2);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(length * 2, 40);
for (let i = 0; i < length; i++)
  wav.writeInt16LE(Math.round(Math.sin((i * 440 * 2 * Math.PI) / rate) * 4000), 44 + i * 2);
const wavPath = path.join(scratch.path, 'microphone-tone.wav');
await writeFile(wavPath, wav);
await using server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(
    '<!doctype html><title>Quick capture source</title><main><h1>Research source</h1><p id="quote">A useful source quote to keep with a spoken note.</p></main>',
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/read`;
const context = await chromium.launchPersistentContext('', {
  ...launchOptions,
  headless: true,
  args: [
    `--disable-extensions-except=${extensionFolder}`,
    `--load-extension=${extensionFolder}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wavPath}`,
  ],
  viewport: { width: 1360, height: 1000 },
  acceptDownloads: true,
});
const errors = [];
const liveGoogle = process.env.MARGIN_LIVE_TRANSLATION_TEST === '1';
context.on('page', (page) =>
  page.on('pageerror', (e) => errors.push({ url: page.url(), message: e.message, stack: e.stack })),
);
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker')),
    base = worker.url().replace('background.js', '');
  const library = await context.newPage();
  await library.goto(base + 'library.html');
  const call = (type, payload = {}) =>
    library.evaluate(
      async ({ type, payload }) => {
        const r = await chrome.runtime.sendMessage({ type, payload });
        if (!r.ok) throw new Error(r.error);
        return r.data;
      },
      { type, payload },
    );
  const page = await call('save-page', {
    url,
    title: 'Quick capture source',
    note: 'Original note.',
  });
  const source = await context.newPage();
  await source.goto(url);
  await source.waitForTimeout(400);
  const tabId = await worker.evaluate(async (url) => {
    for (const t of await chrome.tabs.query({})) {
      try {
        const r = await chrome.tabs.sendMessage(t.id, { action: 'status' });
        if (r.data?.url === url) return t.id;
      } catch {}
    }
  }, url);
  const [capture] = await Promise.all([
    context.waitForEvent('page'),
    call('open-capture', { pageId: page.id, tabId, mode: 'voice' }),
  ]);
  await capture.waitForLoadState();
  await capture.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    globalThis.__streams = [];
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      globalThis.__streams.push(stream);
      return stream;
    };
  });
  await capture.locator('[name=note]').fill('A quick note while reading.');
  await capture.locator('[data-audio-record]').click();
  await expect(capture.locator('[data-audio-status]')).toContainText('Recording audio locally');
  await source.bringToFront();
  await source.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#quote'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await worker.evaluate(async (id) => chrome.tabs.sendMessage(id, { action: 'highlight' }), tabId);
  await expect.poll(async () => (await call('snapshot')).highlights.length).toBe(1);
  await capture.bringToFront();
  await capture.locator('[data-audio-stop]').click();
  await expect(capture.locator('[data-audio-pending] audio')).toHaveCount(1);
  assert.ok(
    await capture.evaluate(() =>
      globalThis.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended')),
    ),
  );
  await capture.locator('[type=submit]').click();
  await expect(capture.locator('#save-status')).toContainText('Saved locally');
  await expect(capture.locator('#saved-audio audio')).toHaveCount(1);
  await expect
    .poll(() => capture.locator('#saved-audio audio').evaluate((a) => a.readyState))
    .toBeGreaterThan(0);
  let backup = await call('backup');
  assert.ok(backup.assets[0].base64.length > 1000);
  assert.equal(backup.assets[0].pageId, page.id);
  assert.match(backup.pages[0].note, /Original note.[\s\S]*A quick note/);
  console.log(
    'PASS: native getUserMedia + MediaRecorder recorded a generated audio input, freed microphone tracks, saved decodable audio, and retained a concurrent page highlight',
  );
  await capture.locator('[data-audio-file]').setInputFiles(wavPath);
  await capture.locator('[type=submit]').click();
  await expect(capture.locator('#saved-audio audio')).toHaveCount(2);
  backup = await call('backup');
  assert.equal(backup.assets.length, 2);
  const backupPath = path.join(scratch.path, 'audio-backup.json');
  await writeFile(backupPath, JSON.stringify(backup));
  await call('delete-page', { id: page.id });
  await library.reload();
  await library.locator('[data-view=settings]').click();
  const chooser = library.waitForEvent('filechooser');
  await library.locator('[data-action=import]').click();
  await (await chooser).setFiles(backupPath);
  await library.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await library.getByRole('dialog').getByRole('heading', { name: 'Restore complete' }).waitFor();
  await library.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(async () => (await call('snapshot')).pages.length).toBe(1);
  await expect.poll(async () => (await call('backup')).assets.length).toBe(2);
  const restored = (await call('snapshot')).pages[0];
  await library.locator('[data-view=all]').click();
  await library.locator('[data-page]').click();
  await expect(library.locator('[data-saved-audio] audio')).toHaveCount(2);
  await expect
    .poll(() =>
      library
        .locator('[data-saved-audio] audio')
        .first()
        .evaluate((a) => a.readyState),
    )
    .toBeGreaterThan(0);
  console.log(
    'PASS: attached audio and recorded audio survive complete backup, deletion, and restore',
  );
  await library.locator('.drawer [data-action=translate-page]').click();
  if (!liveGoogle) {
    await context.route('https://translate.google.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<p>External handoff fixture. Run with MARGIN_LIVE_TRANSLATION_TEST=1 to check the live service.</p>',
      }),
    );
    // Attach Playwright before navigation: Chrome-created tabs can navigate before routing attaches.
    await library.evaluate(() => {
      const original = chrome.tabs.create.bind(chrome.tabs);
      chrome.tabs.create = (options) => {
        globalThis.__translationHandoff = options.url;
        return original({ ...options, url: 'about:blank' });
      };
    });
  }
  await library.locator('[name=provider]').selectOption('web');
  await library.locator('[name=sourceText]').fill('Hello world');
  await library.locator('[name=target]').fill('fa');
  const [google] = await Promise.all([
    context.waitForEvent('page'),
    library.locator('[data-translate]').click(),
  ]);
  if (!liveGoogle) await google.goto(await library.evaluate(() => globalThis.__translationHandoff));
  await google.waitForLoadState('domcontentloaded').catch(() => {});
  assert.equal(new URL(google.url()).searchParams.get('tl'), 'fa');
  assert.equal(new URL(google.url()).searchParams.get('text'), 'Hello world');
  let googleText = '';
  try {
    await google.waitForTimeout(4000);
    googleText = await google.locator('body').innerText();
  } catch {}
  const liveTranslation = /سلام/.test(googleText);
  if (liveGoogle)
    console.log(
      'LIVE GOOGLE WEBSITE:',
      liveTranslation ? 'Persian output observed' : 'handoff opened; output could not be verified',
    );
  else assert.ok(googleText.includes('External handoff fixture'));
  await library.bringToFront();
  await library.locator('[name=result]').fill('سلام دنیا');
  await library.locator('dialog[open] [type=submit]').click();
  await expect
    .poll(async () => (await call('snapshot')).pages.find((p) => p.id === restored.id)?.note)
    .toContain('سلام دنیا');
  console.log('PASS: no-key translation handoff and pasted-result save preserve original notes');
  await library.screenshot({ path: path.join(results, 'audio-notes-library.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(results, 'native-report.json'),
    JSON.stringify(
      {
        passed: true,
        browser: browserTarget,
        realMediaRecorder: true,
        syntheticAudioInput: true,
        microphoneTracksReleased: true,
        audioBackupRestore: true,
        liveGoogleWebsiteOutputObserved: liveTranslation,
        errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  for (const [i, page] of context.pages().entries()) {
    try {
      await page.screenshot({ path: `test-results/native-failure-${i}.png` });
    } catch {}
  }
  throw error;
} finally {
  await context.close();
}
