import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('test-results', { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [
    `--disable-extensions-except=${path.resolve('dist')}`,
    `--load-extension=${path.resolve('dist')}`,
  ],
});
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const page = await context.newPage(),
    messages = [],
    errors = [];
  page.on('console', (message) => messages.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(worker.url().replace('background.js', 'library.html'));
  const saved = await page.evaluate(async () => {
    const result = await chrome.runtime.sendMessage({
      type: 'save-page',
      payload: {
        url: 'local://note/language-regression',
        title: 'Language support regression',
        type: 'note',
        note: 'Hello world',
        text: 'Hello world',
      },
    });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  });
  await page.goto(worker.url().replace('background.js', 'library.html') + '#page=' + saved.id);
  await page.reload();
  await page.locator('.drawer [data-action=translate-page]').click();
  await page.evaluate(() => {
    globalThis.__nativeTranslationProbes = 0;
    const original = globalThis.Translator.availability.bind(globalThis.Translator);
    globalThis.Translator.availability = (...args) => {
      globalThis.__nativeTranslationProbes++;
      return original(...args);
    };
  });
  await page.locator('[name=target]').fill('fa');
  await page.locator('[name=provider]').selectOption('local');
  await expect(page.locator('[data-translate]')).toBeDisabled();
  await expect(page.locator('[data-translation-status]')).toContainText('Persian');
  await page.locator('[name=target]').fill('fr');
  await page.locator('[name=source]').selectOption('fa');
  await expect(page.locator('[data-translate]')).toBeDisabled();
  await page.locator('[name=target]').fill('zz');
  await expect(page.locator('[data-translation-status]')).toContainText('not supported');
  assert.equal(await page.evaluate(() => globalThis.__nativeTranslationProbes), 0);
  await page.locator('[name=provider]').selectOption('web');
  await page.locator('[name=target]').fill('fa');
  await expect(page.locator('[data-translate]')).toBeEnabled();
  await page.locator('dialog[open] [data-close]').first().click();
  await page.locator('.drawer [data-action=edit-page]').click();
  await page.locator('.note-assist summary').click();
  await page.locator('[data-speech-language]').fill('fa-IR');
  await page.locator('[data-speech-language]').press('Tab');
  await expect(page.locator('[data-speech-start]')).toBeDisabled();
  await expect(page.locator('[data-speech-status]')).toContainText('No on-device dictation pack');
  const languageWarnings = messages.filter((message) =>
    message.text.includes('The requested language options are not supported'),
  );
  assert.deepEqual(languageWarnings, []);
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/language-regression-report.json',
    JSON.stringify(
      {
        passed: true,
        nativeTranslationProbesForUnsupportedLanguages: 0,
        languageWarnings,
        uncaughtErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: native Chrome blocks unsupported languages before API probes; original language warning absent; no uncaught exceptions; web fallback available.',
  );
} finally {
  await context.close();
}
