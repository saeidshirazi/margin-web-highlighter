import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import assert from 'node:assert/strict';
import path from 'node:path';
import { browserTarget, extensionFolder, launchOptions } from './chromium-target.mjs';
const results = path.resolve('test-results', browserTarget, 'organization');
await mkdir(results, { recursive: true });
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
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  library = await context.newPage();
  await library.goto(worker.url().replace('background.js', 'library.html'));
  await expect(library.locator('[data-action=add]')).toBeVisible();
  const api = (type, payload = {}) =>
    library.evaluate(
      async ({ type, payload }) => {
        const result = await chrome.runtime.sendMessage({ type, payload });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      { type, payload },
    );
  await api('update-experience', { guideHidden: true });
  const pages = [];
  for (const [title, collection] of [
    ['Offline reading', 'Research/Reading/Books'],
    ['Annotation methods', 'Research/Reading'],
    ['Research journal', 'Researcher'],
    ['New ideas', 'Inbox'],
  ])
    pages.push(
      await api('save-page', {
        url: 'https://example.test/' + title.replaceAll(' ', '-'),
        title,
        collection,
        text: 'Full source text is included only when you ask for it.',
      }),
    );
  const a = pages[0],
    b = pages[1],
    d = pages[3];
  const highlight = await api('add-highlight', {
    pageId: a.id,
    text: 'Keep my quote',
    anchor: { exact: 'Keep my quote' },
    color: '#ffe08a',
    note: 'Keep my note',
  });
  const card = await api('add-card', {
    pageId: a.id,
    highlightId: highlight.id,
    question: 'Q',
    answer: 'A',
  });
  await api('save-audio', {
    id: 'audio:organization',
    pageId: a.id,
    highlightId: highlight.id,
    name: 'Audio',
    type: 'audio/webm',
    base64: 'YWJj',
    createdAt: 1,
  });
  await library.reload();
  await expect(library.locator('[data-collection="Research"]')).toContainText('2');
  await library.locator('[data-collection="Research"]').click();
  await expect(library.locator('.grid [data-page]')).toHaveCount(2);
  await library.reload();
  await expect(library.locator('.page-heading h1')).toHaveText('Research');
  await expect(library.locator('.grid [data-page]')).toHaveCount(2);
  await library.locator('[data-collection="Research"]').focus();
  await library.keyboard.press('ArrowLeft');
  await expect(library.locator('[data-expand="Research"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await library.keyboard.press('ArrowRight');
  await expect(library.locator('[data-expand="Research"]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  pass(
    'nested collections include virtual parents, subtree counts and keyboard expansion without prefix collisions',
  );

  await library.locator('.topbar [data-action=export]').click();
  await library.locator('.preset-editor summary').click();
  await library.locator('[name=format]').selectOption('agent');
  await library.locator('[data-preset-scope]').selectOption('collection');
  await library.locator('[data-preset-collection]').selectOption('Research/Reading');
  await library.locator('[data-preset-name]').fill('Research for agent');
  await library.locator('[name=metadata]').check();
  await library.locator('[data-save-preset]').click();
  await expect(library.locator('[data-preset-status]')).toContainText('saved');
  const preset = (await api('snapshot')).exportPresets[0];
  assert.equal(preset.includeSource, false);
  await library.locator('dialog[open] [data-close]').first().click();
  await expect(library.locator('[data-run-preset]')).toContainText('Research for agent');
  pass(
    'export preset saves an explicit collection scope and options without storing passwords or source content',
  );

  await library.locator('[data-collection="Research/Reading"]').focus();
  await library.keyboard.press('Shift+F10');
  await library.locator('[data-folder-rename]').click();
  await library.locator('dialog[open] [name=name]').fill('Literature');
  await library.locator('dialog[open] [type=submit]').click();
  await expect
    .poll(async () => (await api('snapshot')).pages.find((page) => page.id === a.id).collection)
    .toBe('Research/Literature/Books');
  assert.equal((await api('snapshot')).exportPresets[0].collection, 'Research/Literature');
  await library
    .locator('[data-collection="Research"]')
    .dragTo(library.locator('[data-drop-collection="Inbox"]'));
  await expect
    .poll(async () => (await api('snapshot')).pages.find((page) => page.id === a.id).collection)
    .toBe('Inbox/Research/Literature/Books');
  assert.equal((await api('snapshot')).exportPresets[0].collection, 'Inbox/Research/Literature');
  await api('save-page', { url: a.url, note: 'Edited after the folder move' });
  await expect(library.locator('[data-organization-undo]')).toBeVisible();
  await library.locator('[data-organization-undo]').click();
  await expect
    .poll(async () => (await api('snapshot')).pages.find((page) => page.id === a.id).collection)
    .toBe('Research/Literature/Books');
  assert.equal(
    (await api('snapshot')).pages.find((page) => page.id === a.id).note,
    'Edited after the folder move',
  );
  pass(
    'keyboard rename and folder drag move whole branches and scoped presets; undo preserves later note edits',
  );

  await library.locator(`[data-select="${a.id}"]`).check();
  await library.locator(`[data-select="${d.id}"]`).check();
  await library.keyboard.press('Alt+m');
  await library.locator('dialog[open] [name=collection]').fill('Archive/Chosen');
  await library.locator('dialog[open] [type=submit]').click();
  await expect
    .poll(async () => (await api('snapshot')).pages.find((page) => page.id === a.id).collection)
    .toBe('Archive/Chosen');
  assert.equal(
    (await api('snapshot')).pages.find((page) => page.id === d.id).collection,
    'Archive/Chosen',
  );
  await library.locator('[data-organization-undo]').click();
  await expect
    .poll(async () => (await api('snapshot')).pages.find((page) => page.id === d.id).collection)
    .toBe('Inbox');
  await library.locator(`[data-select="${a.id}"]`).check();
  await library.locator(`[data-select="${b.id}"]`).check();
  await library
    .locator(`[data-page="${a.id}"]`)
    .dragTo(library.locator('[data-drop-collection="Inbox"]'));
  await expect
    .poll(
      async () =>
        (await api('snapshot')).pages.filter(
          (page) => [a.id, b.id].includes(page.id) && page.collection === 'Inbox',
        ).length,
    )
    .toBe(2);
  await library.locator('[data-run-preset]').click();
  await expect(library.locator('#toast')).toContainText('No sources match');
  await library.locator('[data-organization-undo]').click();
  await expect
    .poll(async () => (await api('snapshot')).pages.find((page) => page.id === b.id).collection)
    .toBe('Research/Literature');
  pass(
    'bulk move works by keyboard and multi-source drag; missing collection presets refuse to widen their scope',
  );

  const [download] = await Promise.all([
    library.waitForEvent('download'),
    library.locator('[data-run-preset]').click(),
  ]);
  const zipPath = path.join(results, 'research.zip');
  await download.saveAs(zipPath);
  const archive = unzipSync(new Uint8Array(await readFile(zipPath)));
  const manifest = JSON.parse(strFromU8(archive['manifest.json']));
  assert.deepEqual(new Set(manifest.documents.map((doc) => doc.id)), new Set([a.id, b.id]));
  assert.ok(
    !Object.values(archive).some((bytes) =>
      strFromU8(bytes).includes('Full source text is included only when you ask for it.'),
    ),
  );
  await library
    .locator('[data-collection="Research"]')
    .dragTo(library.locator('[data-drop-collection="Research/Literature"]'));
  await expect(library.locator('#toast')).toContainText('outside this collection');
  await library.locator('[data-manage-collection="Research"]').click();
  await library.locator('[data-folder-rename]').click();
  await library.locator('dialog[open] [name=name]').fill('Inbox');
  await library.locator('dialog[open] [type=submit]').click();
  await expect(library.locator('[data-dialog-error]')).toContainText('already exists');
  await library.locator('dialog[open] [data-close]').first().click();
  pass(
    'one-click agent export includes only its collection; full-source opt-in is respected; collisions and cycles make no partial changes',
  );

  await library.locator('[data-manage-collection="Research"]').click();
  await library.locator('[data-folder-remove]').click();
  await library.locator('dialog[open] [type=submit]').click();
  await expect
    .poll(async () => (await api('snapshot')).pages.find((page) => page.id === a.id).collection)
    .toBe('');
  let snapshot = await api('snapshot');
  assert.equal(snapshot.pages.length, 4);
  assert.equal(snapshot.highlights.find((item) => item.id === highlight.id).note, highlight.note);
  assert.equal(snapshot.cards.find((item) => item.id === card.id).highlightId, highlight.id);
  assert.equal((await api('backup')).assets[0].highlightId, highlight.id);
  await library.locator('[data-organization-undo]').click();
  await expect
    .poll(async () => (await api('snapshot')).pages.find((page) => page.id === a.id).collection)
    .toBe('Research/Literature/Books');
  await expect(library.locator('#toast')).not.toHaveClass(/show/, { timeout: 6000 });
  await library.screenshot({
    path: path.join(results, 'collections-and-presets.png'),
    fullPage: true,
  });
  const backup = await api('backup');
  assert.equal(backup.exportPresets.length, 1);
  assert.equal(backup.exportPresets[0].password, undefined);
  await api('delete-export-preset', { id: preset.id });
  await api('import', backup);
  await api('import', backup);
  assert.equal((await api('snapshot')).exportPresets.length, 1);
  await library.reload();
  await expect(library.locator('[data-run-preset]')).toContainText('Research for agent');
  pass(
    'removing labels never deletes linked research; presets survive full-backup merge and repeat import',
  );
  await library.setViewportSize({ width: 430, height: 900 });
  await expect
    .poll(() => library.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
    .toBe(true);
  await library.screenshot({ path: path.join(results, 'collections-narrow.png'), fullPage: true });
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
}
