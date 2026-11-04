// Real Firefox profiles and IndexedDB; only OAuth and Drive transport are local fixtures.
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { firefox as playwrightFirefox, chromium } from '@playwright/test';
import { zipSync } from 'fflate';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { server, files, calls } from './drive-fixture.mjs';

await mkdir('work', { recursive: true });
const results = path.resolve('test-results/firefox/drive');
await mkdir(results, { recursive: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/fixture`;
const archive = {};
async function collect(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await collect(path.join(dir, entry.name), prefix + entry.name + '/');
    else archive[prefix + entry.name] = new Uint8Array(await readFile(path.join(dir, entry.name)));
  }
}
await collect('dist-firefox');
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
const addon = path.resolve('work/firefox-drive-fixture.xpi');
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
  const connect = async () => {
    await driver.findElement(By.css('[data-drive-connect]')).click();
    await driver.wait(async () => (await api('drive-status')).connected, 20000);
    await settled();
  };
  const sync = async () => {
    await api('drive-now');
    await settled();
  };
  return { driver, api, connect, sync };
}
try {
  const a = await device();
  const page = await a.api('save-page', {
    url: 'https://example.test/firefox-sync',
    title: 'Firefox sync',
    note: 'Original',
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
  await a.driver.findElement(By.css('[data-drive-toggle]')).click();
  await a.driver.wait(async () => (await a.api('drive-status')).enabled === false, 10000);
  await a.driver.findElement(By.css('[data-drive-disconnect]')).click();
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
  await new Promise((resolve) => server.close(resolve));
}
