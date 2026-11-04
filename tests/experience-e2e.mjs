import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserTarget, extensionFolder, launchOptions } from './chromium-target.mjs';

const results = path.resolve('test-results', browserTarget, 'experience');
await mkdir(results, { recursive: true });
let revised = false;
const server = createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(
    `<!doctype html><title>A source that changes</title><article style="max-width:760px;margin:80px auto;font:20px/1.8 Georgia"><h1>A source that changes</h1><p id="quote">${revised ? 'An entirely rewritten passage now lives here.' : 'This original quotation is worth keeping.'}</p><p id="replacement">A revised idea can keep its original notes.</p>${'<p>Read carefully and save your own thoughts.</p>'.repeat(8)}</article>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const context = await chromium.launchPersistentContext('', {
  ...launchOptions,
  headless: true,
  acceptDownloads: true,
  args: [`--disable-extensions-except=${extensionFolder}`, `--load-extension=${extensionFolder}`],
  viewport: { width: 1440, height: 1000 },
});
const errors = [];
context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
const checks = [];
let library;
const pass = (text) => {
  checks.push(text);
  console.log('PASS:', text);
};
async function select(page, selector) {
  return page.evaluate((selector) => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(selector));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const rect = range.getBoundingClientRect();
    document.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, clientX: rect.left, clientY: rect.bottom }),
    );
    return {
      x: Math.max(10, Math.min(rect.left, innerWidth - 350)) + 24,
      y: Math.min(rect.bottom + 33, innerHeight - 60),
    };
  }, selector);
}
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const base = worker.url().replace('background.js', '');
  library = await context.newPage();
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
  await expect(library.locator('.onboarding-guide')).toBeVisible();
  await expect(library.locator('.onboarding-guide summary')).toContainText('0 of 4');
  const [practice] = await Promise.all([
    context.waitForEvent('page'),
    library.locator('[data-practice]').click(),
  ]);
  await practice.waitForLoadState();
  await practice.locator('div[data-margin-ui]').waitFor({ state: 'attached' });
  const point = await select(practice, '#practice-quote');
  await practice.waitForTimeout(80);
  await practice.mouse.click(point.x, point.y);
  await expect.poll(async () => (await api('snapshot')).highlights.length).toBe(1);
  await practice.locator('#practice-library').click();
  await library.reload();
  await expect(library.locator('.onboarding-guide summary')).toContainText('1 of 4');
  await library.locator('.onboarding-guide summary').click();
  await library.locator('[data-hide-guide]').click();
  await expect(library.locator('.onboarding-guide')).toHaveCount(0);
  await library.reload();
  await expect(library.locator('.onboarding-guide')).toHaveCount(0);
  await library.locator('[data-view=settings]').click();
  await library.locator('[data-show-guide]').click();
  await expect(library.locator('.onboarding-guide')).toBeVisible();
  pass(
    'local practice page creates a real highlight; guide hides, persists, and reopens from Settings',
  );

  const source = await context.newPage();
  await source.goto(`http://127.0.0.1:${server.address().port}/source`);
  await source.locator('div[data-margin-ui]').waitFor({ state: 'attached' });
  const quotePoint = await select(source, '#quote');
  await source.waitForTimeout(80);
  await source.mouse.click(quotePoint.x, quotePoint.y);
  await expect.poll(async () => (await api('snapshot')).highlights.length).toBe(2);
  let snapshot = await api('snapshot');
  const page = snapshot.pages.find((page) => page.url.startsWith('http://127.0.0.1:'));
  const highlight = snapshot.highlights.find((item) => item.pageId === page.id);
  await api('update-highlight', {
    id: highlight.id,
    patch: { note: 'My original reasoning.', tags: ['keep'] },
  });
  const card = await api('add-card', {
    pageId: page.id,
    highlightId: highlight.id,
    question: 'Why?',
    answer: 'Keep the idea.',
  });
  await api('save-audio', {
    id: 'audio:repair-e2e',
    pageId: page.id,
    highlightId: highlight.id,
    type: 'audio/webm',
    base64: 'YWJj',
    name: 'Fixture',
    createdAt: 1,
  });
  revised = true;
  await source.reload();
  await expect.poll(() => source.evaluate(() => CSS.highlights.size)).toBe(0);
  async function beginRepair() {
    await library.goto(base + 'library.html#page=' + page.id);
    await library.reload();
    await library.locator(`[data-repair-highlight="${highlight.id}"]`).click();
    await library.locator('dialog[open] [type=submit]').click();
    await source.locator('div[data-margin-mode=repair]').waitFor({ state: 'attached' });
  }
  await beginRepair();
  await select(source, '#replacement');
  await source.waitForTimeout(100);
  await source.screenshot({ path: path.join(results, 'repair-preview.png') });
  await source.keyboard.press('Escape');
  assert.equal(
    (await api('snapshot')).highlights.find((item) => item.id === highlight.id).text,
    highlight.text,
  );
  pass('repair cancellation leaves the original highlight unchanged');
  await beginRepair();
  await select(source, '#replacement');
  await source.waitForTimeout(80);
  await api('update-highlight', { id: highlight.id, patch: { note: 'Edited in another tab.' } });
  await source.keyboard.press('Enter');
  await source.waitForTimeout(120);
  assert.equal(
    (await api('snapshot')).highlights.find((item) => item.id === highlight.id).text,
    highlight.text,
  );
  await source.keyboard.press('Escape');
  await beginRepair();
  await select(source, '#replacement');
  await source.waitForTimeout(80);
  await source.keyboard.press('Enter');
  await expect
    .poll(
      async () => (await api('snapshot')).highlights.find((item) => item.id === highlight.id).text,
    )
    .toBe('A revised idea can keep its original notes.');
  snapshot = await api('snapshot');
  const repaired = snapshot.highlights.find((item) => item.id === highlight.id);
  assert.equal(repaired.note, 'Edited in another tab.');
  assert.deepEqual(repaired.tags, ['keep']);
  assert.equal(repaired.originalText, highlight.text);
  assert.equal(snapshot.cards.find((item) => item.id === card.id).highlightId, highlight.id);
  assert.equal((await api('backup')).assets[0].highlightId, highlight.id);
  await source.reload();
  await expect.poll(() => source.evaluate(() => CSS.highlights.size)).toBe(1);
  await library.goto(base + 'library.html#page=' + page.id);
  await library.reload();
  await expect(library.locator('.repair-history')).toContainText(highlight.text);
  pass(
    'stale repair is rejected; confirmed replacement survives reload with notes/tags/cards/audio and original quote intact',
  );
  const practicePage = (await api('snapshot')).pages.find(
    (item) => item.url === 'local://practice/welcome',
  );
  const practiceHighlight = (await api('snapshot')).highlights.find(
    (item) => item.pageId === practicePage.id,
  );
  await library.goto(base + 'library.html#page=' + practicePage.id);
  await library.reload();
  await library.locator(`[data-repair-highlight="${practiceHighlight.id}"]`).click();
  const [savedReader] = await Promise.all([
    context.waitForEvent('page'),
    library.locator('dialog[open] [type=submit]').click(),
  ]);
  await savedReader.waitForLoadState();
  await savedReader.locator('#article p').first().waitFor();
  await savedReader.locator('div[data-margin-mode=repair]').waitFor({ state: 'attached' });
  await select(savedReader, '#article p:nth-of-type(2)');
  await savedReader.waitForTimeout(100);
  await savedReader.keyboard.press('Enter');
  await expect
    .poll(
      async () =>
        (await api('snapshot')).highlights.find((item) => item.id === practiceHighlight.id).text,
    )
    .toBe('Select a sentence, choose a color, and add a thought in your own words.');
  pass('saved-article repair uses the same confirmation flow and keeps the existing highlight ID');

  for (let index = 0; index < 50; index++)
    await api('save-page', { url: page.url, note: 'Reminder change ' + index });
  await library.reload();
  await expect(library.locator('.backup-reminder')).toBeVisible();
  await library.screenshot({ path: path.join(results, 'backup-reminder.png') });
  await library.locator('[data-backup-snooze]').click();
  await expect(library.locator('.backup-reminder')).toHaveCount(0);
  await library.reload();
  await expect(library.locator('.backup-reminder')).toHaveCount(0);
  pass('count-based reminder appears without notifications and snoozes persistently');
  await library.locator('[data-view=settings]').click();
  await library.locator('[data-backup-enabled]').uncheck();
  await library.reload();
  await expect(library.locator('[data-backup-enabled]')).not.toBeChecked();
  await library.locator('[data-backup-enabled]').check();
  await library.locator('[data-settings-backup]').click();
  const beforeFailure = await api('device-experience');
  await library.evaluate(() => {
    window.originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      throw new Error('Download fixture failed');
    };
  });
  await library.locator('dialog[open] [type=submit]').click();
  await expect(library.locator('[data-dialog-error]')).toContainText('Download fixture failed');
  assert.equal((await api('device-experience')).lastBackupAt, beforeFailure.lastBackupAt);
  await library.evaluate(() => {
    HTMLAnchorElement.prototype.click = window.originalAnchorClick;
  });
  const [download] = await Promise.all([
    library.waitForEvent('download'),
    library.locator('dialog[open] [type=submit]').click(),
  ]);
  const downloaded = path.join(results, 'backup.json');
  await download.saveAs(downloaded);
  const backup = JSON.parse(await readFile(downloaded, 'utf8'));
  assert.ok(!JSON.stringify(backup).includes('device-experience'));
  assert.equal(backup.settings.lastBackupAt, undefined);
  assert.equal(
    backup.highlights.find((item) => item.id === highlight.id).originalText,
    highlight.text,
  );
  await expect.poll(async () => (await api('device-experience')).lastBackupAt).toBeGreaterThan(0);
  await expect(library.locator('[data-last-backup]')).not.toContainText('Not yet');
  const revision = await api('backup-revision');
  await api('save-page', { url: page.url, note: 'While a backup is being encrypted.' });
  await api('backup-downloaded', { revision });
  const device = await api('device-experience');
  assert.equal(device.changes - device.backedUpChanges, 1);
  pass(
    'reminder opt-out persists; failed downloads do not acknowledge backups; full backups exclude device state and retain repair history; concurrent changes remain pending',
  );
  await library.locator('[data-view=all]').click();
  await library.locator('#search').fill('revised idea');
  await expect.poll(async () => (await api('device-experience')).searched).toBe(true);
  await library.locator('#search').fill('');
  await library.screenshot({ path: path.join(results, 'guide-progress.png') });
  await library.setViewportSize({ width: 430, height: 900 });
  await expect
    .poll(() => library.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    .toBe(true);
  await library.screenshot({ path: path.join(results, 'guide-narrow.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(results, 'report.json'),
    JSON.stringify({ passed: true, browser: browserTarget, checks, errors }, null, 2),
  );
} catch (error) {
  await library
    ?.screenshot({ path: path.join(results, 'failure.png'), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await new Promise((resolve) => server.close(resolve));
}
