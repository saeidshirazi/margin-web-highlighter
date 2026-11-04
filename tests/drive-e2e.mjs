import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { server, files, calls } from './drive-fixture.mjs';
import { browserTarget, extensionFolder, launchOptions } from './chromium-target.mjs';
const results = path.resolve('test-results', browserTarget, 'drive');
await mkdir('work', { recursive: true });
await mkdir(results, { recursive: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/fixture`;
const contexts = [],
  errors = [];
async function device() {
  const context = await chromium.launchPersistentContext(
    await mkdtemp(path.resolve('work/drive-profile-')),
    {
      ...launchOptions,
      headless: true,
      args: [
        `--disable-extensions-except=${extensionFolder}`,
        `--load-extension=${extensionFolder}`,
      ],
    },
  );
  contexts.push(context);
  context.setDefaultTimeout(15000);
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  // Exercise missing-registration UI even when the maintainer's local build is configured.
  await worker.evaluate(() => {
    const manifest = chrome.runtime.getManifest();
    delete manifest.oauth2;
    chrome.runtime.getManifest = () => manifest;
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(worker.url().replace('background.js', 'library.html') + '#settings');
  await expect(page.locator('[data-drive-connect]')).toBeEnabled();
  if (browserTarget === 'chrome') {
    await expect(page.locator('[data-drive-setup]')).toBeVisible();
    await page.locator('[data-drive-connect]').click();
    await expect(page.locator('[data-drive-status]')).toContainText('not registered');
    await expect(page.locator('[data-drive-setup]')).toHaveAttribute('open', '');
  }
  // Only test-profile APIs are replaced. No real Google account or OAuth credentials are used.
  await worker.evaluate((endpoint) => {
    const manifest = chrome.runtime.getManifest();
    chrome.runtime.getManifest = () => ({
      ...manifest,
      oauth2: {
        client_id: '123-fixture.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/drive.appdata'],
      },
    });
    chrome.identity.getAuthToken = async () => ({
      token: 'fixture-only-no-google-access',
      grantedScopes: ['https://www.googleapis.com/auth/drive.appdata'],
    });
    chrome.identity.clearAllCachedAuthTokens = async () => {};
    chrome.identity.launchWebAuthFlow = async ({ url }) => {
      const state = new URL(url).searchParams.get('state');
      return (
        chrome.identity.getRedirectURL() +
        '#' +
        new URLSearchParams({
          access_token: 'fixture-only-no-google-access',
          token_type: 'Bearer',
          expires_in: '3600',
          scope: 'https://www.googleapis.com/auth/drive.appdata',
          state,
        })
      );
    };
    chrome.permissions.contains = async () => true;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      if (new URL(url).origin !== 'https://www.googleapis.com')
        throw new Error('Unexpected network request in Drive fixture');
      return originalFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: String(url),
          method: options.method || 'GET',
          headers: options.headers,
          body:
            options.body instanceof Uint8Array
              ? { bytes: [...options.body] }
              : { text: options.body },
        }),
      });
    };
  }, endpoint);
  await page.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await expect(page.locator('[data-drive-connect]')).toBeEnabled();
  await expect(page.locator('[data-drive-setup]')).toBeHidden();
  const api = (type, payload = {}) =>
    page.evaluate(
      async ({ type, payload }) => {
        const result = await chrome.runtime.sendMessage({ type, payload });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      { type, payload },
    );
  async function sync() {
    await api('drive-now');
    await expect.poll(async () => (await api('drive-status')).busy, { timeout: 20000 }).toBe(false);
    assert.equal((await api('drive-status')).phase, 'ready');
  }
  async function connect() {
    await page.locator('[data-drive-connect]').click();
    await expect.poll(async () => (await api('drive-status')).connected).toBe(true);
    await expect.poll(async () => (await api('drive-status')).busy, { timeout: 20000 }).toBe(false);
    assert.equal((await api('drive-status')).phase, 'ready');
  }
  return { page, api, sync, connect };
}
try {
  const a = await device();
  const page = await a.api('save-page', {
    url: 'https://example.test/sync',
    title: 'Synced research',
    note: 'Original note',
    bookmarked: true,
  });
  const h = await a.api('add-highlight', {
    pageId: page.id,
    text: 'A research quote',
    anchor: { exact: 'A research quote', start: 0, end: 16 },
    color: '#ffe08a',
    note: 'Quote note',
  });
  await a.api('add-card', {
    pageId: page.id,
    highlightId: h.id,
    question: 'Question',
    answer: 'Answer',
  });
  await a.api('save-audio', {
    id: 'audio:fixture',
    pageId: page.id,
    highlightId: h.id,
    name: 'Voice',
    type: 'audio/webm',
    base64: 'YWJj',
    createdAt: 1,
  });
  await a.api('settings', { translationTarget: 'fr' });
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('A PDF synchronized through Google Drive.');
  const pdfBytes = await pdf.save(),
    pdfPath = path.join(results, 'drive-fixture.pdf');
  await writeFile(pdfPath, pdfBytes);
  await a.page.locator('[data-action=add]').click();
  await a.page.locator('dialog [data-action=pdf]').click();
  await a.page.locator('dialog input[type=file]').setInputFiles(pdfPath);
  const [pdfView] = await Promise.all([
    a.page.context().waitForEvent('page'),
    a.page.locator('dialog[open] [type=submit]').click(),
  ]);
  await pdfView.waitForLoadState();
  await pdfView.close();
  await a.connect();
  const b = await device();
  await b.connect();
  const restored = await b.api('backup');
  assert.equal(restored.pages.length, 2);
  assert.equal(restored.pages.find((p) => p.url === page.url).note, 'Original note');
  assert.equal(restored.highlights[0].note, 'Quote note');
  assert.equal(restored.cards[0].highlightId, restored.highlights[0].id);
  assert.equal(restored.assets.find((asset) => asset.type === 'audio/webm').base64, 'YWJj');
  assert.equal(
    restored.assets.find((asset) => asset.type === 'application/pdf').base64,
    Buffer.from(pdfBytes).toString('base64'),
  );
  assert.equal(restored.settings.translationTarget, 'fr');
  await a.api('update-experience', { guideHidden: true, searched: true, intervalDays: 30 });
  await a.api('save-export-preset', {
    id: 'local-export',
    name: 'Local export',
    format: 'agent',
    scope: 'all',
  });
  const currentHighlight = (await a.api('snapshot')).highlights.find((item) => item.id === h.id);
  const replacement = 'A repaired research quote';
  await a.api('repair-highlight', {
    id: h.id,
    text: replacement,
    anchor: { exact: replacement, start: 0, end: replacement.length, prefix: '', suffix: '' },
    expectedUpdatedAt: currentHighlight.updatedAt,
  });
  await a.sync();
  await b.sync();
  const repairedBackup = await b.api('backup');
  assert.equal(repairedBackup.highlights[0].text, replacement);
  assert.equal(repairedBackup.highlights[0].originalText, h.text);
  assert.equal(repairedBackup.cards[0].highlightId, repairedBackup.highlights[0].id);
  assert.equal((await b.api('device-experience')).guideHidden, false);
  assert.equal((await b.api('device-experience')).intervalDays, 7);
  assert.equal((await b.api('device-experience')).lastBackupAt, 0);
  assert.equal((await b.api('snapshot')).exportPresets.length, 0);
  await a.api('drive-pause');
  await b.api('drive-pause');
  await a.api('save-page', { url: page.url, note: 'Edited on A' });
  await b.api('save-page', { url: page.url, note: 'Edited on B' });
  await a.sync();
  await b.sync();
  await a.sync();
  assert.equal(
    (await a.api('backup')).pages.find((p) => p.url === page.url).note,
    (await b.api('backup')).pages.find((p) => p.url === page.url).note,
  );
  const recovery = await a.api('drive-conflicts');
  assert.ok(
    Object.values(recovery.conflicts).some((entry) =>
      ['Edited on A', 'Edited on B'].includes(entry.value.note),
    ),
  );
  await a.api('delete-page', { id: page.id });
  await a.sync();
  await b.sync();
  assert.equal((await b.api('backup')).pages.length, 1);
  assert.equal((await b.api('backup')).assets.length, 1);
  const pdfPage = (await a.api('backup')).pages.find((p) => p.type === 'pdf');
  await a.api('delete-page', { id: pdfPage.id });
  await a.sync();
  await b.sync();
  assert.equal((await b.api('backup')).pages.length, 0);
  assert.equal((await b.api('backup')).assets.length, 0);
  await a.api('drive-resume');
  await expect.poll(async () => (await a.api('drive-status')).busy).toBe(false);
  await a.page.reload();
  await expect(a.page.locator('[data-drive-label]')).toHaveText('Automatic sync on');
  await a.page.screenshot({
    path: path.join(results, 'google-drive-settings.png'),
    fullPage: true,
  });
  await a.page.locator('[data-drive-toggle]').click();
  await expect(a.page.locator('[data-drive-label]')).toHaveText('Paused');
  await a.page.locator('[data-drive-disconnect]').click();
  await expect(a.page.locator('[data-drive-label]')).toHaveText('Local only');
  assert.deepEqual(errors, []);
  assert.equal(files.size, 2);
  await writeFile(
    path.join(results, 'google-drive-report.json'),
    JSON.stringify(
      {
        passed: true,
        browser: browserTarget,
        mode: 'two isolated Chromium profiles; OAuth and Drive are local fixtures, not live Google',
        replicas: files.size,
        requests: calls.length,
        uncaughtErrors: errors,
        checks: [
          ...(browserTarget === 'chrome' ? ['unconfigured setup'] : []),
          'connect consent',
          'all record types',
          'repair history and linked records sync without device-only guide/reminder state',
          'cross-device recovery',
          'concurrent edits',
          'recovery copies',
          'deletions',
          'pause',
          'resume',
          'disconnect',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: two real Chromium extension profiles synced records/audio/settings, preserved concurrent edits, propagated deletion, and passed connect/pause/resume/disconnect UI checks (local OAuth/Drive fixture).',
  );
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await new Promise((resolve) => server.close(resolve));
}
