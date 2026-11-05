// Real Firefox profiles and IndexedDB; only OAuth and Drive transport are local fixtures.
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { firefox as playwrightFirefox, chromium, expect } from '@playwright/test';
import { zipSync } from 'fflate';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { server as fixtureServer, files, calls } from './drive-fixture.mjs';

import { archiveFiles } from '../scripts/archive-files.mjs';
import { scratchDirectory } from '../scripts/scratch-directory.mjs';

await using scratch = await scratchDirectory('test-firefox-drive');
await using server = fixtureServer;
const results = path.resolve('test-results/firefox/drive');
await mkdir(results, { recursive: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/fixture`;
const archive = await archiveFiles('dist-firefox');
const manifest = JSON.parse(new TextDecoder().decode(archive['manifest.json']));
manifest.background.scripts.unshift('fixture-bootstrap.js');
archive['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));
archive['fixture-bootstrap.js'] = new TextEncoder().encode(`
browser.identity.launchWebAuthFlow=async ({url})=>browser.identity.getRedirectURL()+'#'+new URLSearchParams({access_token:'fixture-only-no-google-access',token_type:'Bearer',expires_in:'3600',scope:'https://www.googleapis.com/auth/drive.appdata',state:new URL(url).searchParams.get('state')});
browser.permissions.contains=async()=>true;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
 if(new URL(url).origin!=='https://www.googleapis.com') throw new Error('Unexpected fixture network request');
 return originalFetch(${JSON.stringify(endpoint)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:String(url),method:options.method||'GET',headers:options.headers,body:options.body instanceof Uint8Array?{bytes:[...options.body]}:{text:options.body}})});
};`);
const addon = path.join(scratch.path, 'margin-drive-fixture.xpi');
await writeFile(addon, zipSync(archive));
const drivers = [];
let edgeContext;
async function device() {
  const uuid = crypto.randomUUID();
  const options = new firefox.Options()
    .setBinary(process.env.MARGIN_FIREFOX_BINARY || playwrightFirefox.executablePath())
    .addArguments('-headless')
    .setPreference(
      'extensions.webextensions.uuids',
      JSON.stringify({ 'margin-local-highlighter@margin.local': uuid }),
    );
  const service = new firefox.ServiceBuilder().setEnvironment({
    ...process.env,
    MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1',
  });
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build();
  drivers.push(driver);
  await driver.manage().setTimeouts({ script: 30000 });
  await driver.installAddon(addon, true);
  await driver.get(`moz-extension://${uuid}/library.html#settings`);
  await driver.wait(until.elementLocated(By.css('[data-drive-connect]')), 15000);
  await driver.executeScript(() => {
    browser.permissions.request = async () => true;
  });
  const api = async (type, payload = {}) => {
    const result = await driver.executeAsyncScript(
      (type, payload, done) =>
        browser.runtime
          .sendMessage({ type, payload })
          .then(done, (error) => done({ ok: false, error: error.message })),
      type,
      payload,
    );
    if (!result?.ok) throw new Error(result?.error || 'Firefox message failed');
    return result.data;
  };
  const settled = async () => {
    await driver.wait(async () => !(await api('drive-status')).busy, 30000);
    const status = await api('drive-status');
    assert.equal(status.phase, 'ready', JSON.stringify(status));
  };
  const click = (selector) =>
    driver.wait(
      async () => {
        try {
          const item = await driver.findElement(By.css(selector));
          if (!(await item.isDisplayed()) || !(await item.isEnabled())) return false;
          await item.click();
          return true;
        } catch (error) {
          if (['StaleElementReferenceError', 'NoSuchElementError'].includes(error.name))
            return false;
          throw error;
        }
      },
      15000,
      'Click ' + selector,
      100,
    );
  const connect = async () => {
    await click('[data-drive-connect]');
    await driver.wait(async () => (await api('drive-status')).connected, 20000);
    await settled();
  };
  const sync = async () => {
    await api('drive-now');
    await settled();
  };
  return { driver, api, connect, sync, click };
}
try {
  const a = await device();
  const page = await a.api('save-page', {
    url: 'https://example.test/firefox-sync',
    title: 'Firefox sync',
    note: 'Original',
    text: Array.from(
      { length: 60 },
      (_, index) => `Paragraph ${index}. Reading across browsers.`,
    ).join('\n\n'),
  });
  const h = await a.api('add-highlight', {
    pageId: page.id,
    text: 'A shared quote',
    anchor: { exact: 'A shared quote' },
    color: '#ffe08a',
  });
  await a.api('add-card', { pageId: page.id, highlightId: h.id, question: 'Q', answer: 'A' });
  await a.api('save-audio', {
    id: 'audio:fixture',
    pageId: page.id,
    name: 'Voice',
    type: 'audio/webm',
    base64: 'YWJj',
    createdAt: 1,
  });
  await a.api('settings', { translationTarget: 'fa' });
  await a.connect();
  const b = await device();
  await b.connect();
  const backup = await b.api('backup');
  assert.equal(backup.pages[0].note, 'Original');
  assert.equal(backup.highlights[0].text, 'A shared quote');
  assert.equal(backup.cards.length, 1);
  assert.equal(backup.assets[0].base64, 'YWJj');
  assert.equal(backup.settings.translationTarget, 'fa');
  await a.api('update-experience', { guideHidden: true, searched: true, intervalDays: 30 });
  await a.api('save-export-preset', {
    id: 'local-preset',
    name: 'Local preset',
    format: 'md',
    scope: 'all',
  });
  const currentHighlight = (await a.api('snapshot')).highlights.find((item) => item.id === h.id);
  const replacement = 'A repaired shared quote';
  await a.api('repair-highlight', {
    id: h.id,
    text: replacement,
    anchor: { exact: replacement, start: 0, end: replacement.length, prefix: '', suffix: '' },
    expectedUpdatedAt: currentHighlight.updatedAt,
  });
  await a.sync();
  await b.sync();
  assert.equal((await b.api('backup')).highlights[0].originalText, 'A shared quote');
  assert.equal((await b.api('device-experience')).guideHidden, false);
  assert.equal((await b.api('device-experience')).intervalDays, 7);
  assert.equal((await b.api('snapshot')).exportPresets.length, 0);
  const edgeFolder = path.resolve('dist-edge');
  edgeContext = await chromium.launchPersistentContext('', {
    channel: process.env.MARGIN_CROSS_CHROMIUM || 'msedge',
    headless: true,
    args: [`--disable-extensions-except=${edgeFolder}`, `--load-extension=${edgeFolder}`],
  });
  const worker =
    edgeContext.serviceWorkers()[0] || (await edgeContext.waitForEvent('serviceworker'));
  await worker.evaluate((source) => {
    globalThis.browser = chrome;
    (0, eval)(source);
  }, new TextDecoder().decode(archive['fixture-bootstrap.js']));
  const edgePage = await edgeContext.newPage();
  await edgePage.goto(worker.url().replace('background.js', 'library.html'));
  const edgeApi = (type, payload = {}) =>
    edgePage.evaluate(
      async ({ type, payload }) => {
        const result = await chrome.runtime.sendMessage({ type, payload });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      { type, payload },
    );
  await edgeApi('drive-connect');
  await edgePage.waitForTimeout(100);
  await a.driver.wait(async () => !(await edgeApi('drive-status')).busy, 20000);
  assert.equal((await edgeApi('drive-status')).phase, 'ready');
  assert.equal((await edgeApi('backup')).pages[0].note, 'Original');
  assert.equal((await edgeApi('backup')).highlights[0].text, replacement);
  assert.equal((await edgeApi('backup')).highlights[0].originalText, 'A shared quote');
  assert.equal((await edgeApi('snapshot')).exportPresets.length, 0);

  const firefoxSettings = await a.driver.getCurrentUrl();
  const firefoxHome = firefoxSettings.split('#')[0];
  await a.driver.get(firefoxHome.replace('library.html', `reader.html?id=${page.id}`));
  await a.driver.wait(until.elementLocated(By.css('#article')), 15000);
  await a.driver.executeScript(() =>
    window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.63),
  );
  await a.driver.sleep(400);
  await a.driver.get(firefoxSettings);
  await a.sync();
  assert.ok([...files.values()].every((file) => !file.data.readingPositions));
  await a.click('#drive-reading');
  await a.driver.wait(async () => (await a.api('drive-status')).readingPositions === true, 15000);
  await a.sync();
  assert.ok([...files.values()].some((file) => file.data.readingPositions?.[0]?.id === page.url));

  const edgeHome = worker.url().replace('background.js', 'library.html');
  const edgeSync = async () => {
    await edgeApi('drive-now');
    await expect.poll(async () => (await edgeApi('drive-status')).busy).toBe(false);
    assert.equal((await edgeApi('drive-status')).phase, 'ready');
  };
  await edgeSync();
  await edgePage.goto(edgeHome);
  await expect(edgePage.locator('[data-continue-reading]')).toHaveCount(0);
  await edgePage.locator('[data-view=settings]').click();
  await expect(edgePage.getByLabel('Sync reading positions')).not.toBeChecked();
  await edgePage.getByLabel('Sync reading positions').check();
  await expect.poll(async () => (await edgeApi('drive-status')).readingPositions).toBe(true);
  await edgeSync();
  await edgePage.goto(edgeHome);
  const edgeResume = edgePage.locator('[data-continue-reading] a');
  await expect(edgeResume).toContainText('63% through article');
  const edgeUrl = await edgeResume.getAttribute('href');
  assert.notEqual(new URL(edgeUrl).searchParams.get('id'), page.id);
  await edgePage.goto(edgeUrl);
  const readingFraction = () =>
    window.scrollY / (document.documentElement.scrollHeight - innerHeight);
  await expect.poll(() => edgePage.evaluate(readingFraction)).toBeCloseTo(0.63, 2);
  await edgePage.evaluate(() =>
    window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.24),
  );
  await edgePage.waitForTimeout(400);
  await edgePage.goto(edgeHome);
  await edgeSync();
  await a.sync();
  await a.driver.get(firefoxHome);
  const firefoxResume = await a.driver.wait(
    until.elementLocated(By.css('[data-continue-reading] a')),
    15000,
  );
  assert.match(await firefoxResume.getText(), /24% through article/);
  await a.driver.get(await firefoxResume.getAttribute('href'));
  await a.driver.wait(
    async () => Math.abs((await a.driver.executeScript(readingFraction)) - 0.24) < 0.01,
    15000,
  );
  await a.driver.get(firefoxSettings);
  await b.sync();
  assert.notEqual((await b.api('drive-status')).readingPositions, true);
  console.log(
    'PASS: opt-in reading progress resumes across Firefox and Chromium in both directions.',
  );

  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('First page of the sync fixture.');
  pdf.addPage().drawText('Second page of the sync fixture.');
  await edgePage.locator('[data-action=add]').click();
  await edgePage.locator('dialog [data-action=pdf]').click();
  await edgePage.locator('dialog input[type=file]').setInputFiles({
    name: 'Reading sync fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  const [pdfViewer] = await Promise.all([
    edgeContext.waitForEvent('page'),
    edgePage.locator('dialog button[type=submit]').click(),
  ]);
  await expect(pdfViewer.locator('[data-pdf-page="2"] canvas')).toBeVisible();
  await pdfViewer.locator('#page-number').fill('2');
  await pdfViewer.locator('#page-number').dispatchEvent('change');
  await pdfViewer.waitForTimeout(400);
  await pdfViewer.close();
  await edgeSync();
  await a.sync();
  await a.driver.get(firefoxHome);
  const pdfResume = await a.driver.wait(
    until.elementLocated(By.css('[data-continue-reading] a[href*="pdf.html"]')),
    15000,
  );
  assert.match(await pdfResume.getText(), /PDF page 2/);
  await a.driver.get(await pdfResume.getAttribute('href'));
  await a.driver.wait(until.elementLocated(By.css('[data-pdf-page="2"] canvas')), 15000);
  assert.equal(
    await (await a.driver.findElement(By.css('#page-number'))).getAttribute('value'),
    '2',
  );
  await a.driver.get(firefoxSettings);
  const edgePdf = (await edgeApi('snapshot')).pages.find((item) => item.type === 'pdf');
  await edgeApi('delete-page', { id: edgePdf.id });
  await edgeSync();
  await a.sync();
  await a.click('#drive-reading');
  await a.driver.wait(async () => (await a.api('drive-status')).readingPositions === false, 15000);
  await a.sync();
  await a.driver.get(firefoxHome);
  const localResume = await a.driver.wait(
    until.elementLocated(By.css('[data-continue-reading] a')),
    15000,
  );
  assert.match(await localResume.getText(), /24% through article/);
  await a.driver.get(firefoxSettings);
  console.log('PASS: PDF page sync and turning off reading sync while keeping local progress.');

  await edgeApi('save-page', { url: page.url, note: 'Edited from Chromium' });
  await edgeApi('drive-now');
  await a.driver.wait(async () => !(await edgeApi('drive-status')).busy, 20000);
  await a.sync();
  await b.sync();
  assert.equal((await a.api('backup')).pages[0].note, 'Edited from Chromium');
  await edgeContext.close();
  edgeContext = undefined;
  await a.api('drive-pause');
  await b.api('drive-pause');
  await a.api('save-page', { url: page.url, note: 'Firefox A' });
  await b.api('save-page', { url: page.url, note: 'Firefox B' });
  await a.sync();
  await b.sync();
  await a.sync();
  assert.equal((await a.api('backup')).pages[0].note, (await b.api('backup')).pages[0].note);
  assert.ok(Object.keys((await a.api('drive-conflicts')).conflicts).length);
  await a.api('delete-page', { id: page.id });
  await a.sync();
  await b.sync();
  assert.equal((await b.api('backup')).pages.length, 0);
  assert.equal((await b.api('backup')).assets.length, 0);
  await a.api('drive-resume');
  await a.driver.wait(async () => !(await a.api('drive-status')).busy, 20000);
  await a.driver.navigate().refresh();
  await a.driver.wait(until.elementLocated(By.css('[data-drive-toggle]')), 15000);
  await a.click('[data-drive-toggle]');
  await a.driver.wait(async () => (await a.api('drive-status')).enabled === false, 10000);
  await a.click('[data-drive-disconnect]');
  await a.driver.wait(async () => !(await a.api('drive-status')).connected, 10000);
  await writeFile(
    path.join(results, 'report.json'),
    JSON.stringify(
      {
        passed: true,
        browser: 'Firefox',
        version: (await a.driver.getCapabilities()).get('browserVersion'),
        mode: 'Two isolated Firefox profiles and one Chromium profile; local OAuth and Drive fixtures, no live Google account',
        chromiumChannel: process.env.MARGIN_CROSS_CHROMIUM || 'msedge',
        replicas: files.size,
        requests: calls.length,
        checks: [
          'native web OAuth adapter and state verification',
          'connect UI',
          'records, audio, settings',
          'Firefox to Chromium and back',
          'opt-in article and PDF reading progress across browser-local source IDs',
          'concurrent edit recovery',
          'cascading deletions',
          'pause, resume, disconnect',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: Firefox two-profile Drive synchronization and controls (local OAuth/Drive fixtures).',
  );
} finally {
  await edgeContext?.close();
  await Promise.all(drivers.map((driver) => driver.quit()));
}
