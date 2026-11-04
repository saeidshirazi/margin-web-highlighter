import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserTarget, extensionFolder, launchOptions } from './chromium-target.mjs';

const context = await chromium.launchPersistentContext('', {
  ...launchOptions,
  headless: true,
  args: [`--disable-extensions-except=${extensionFolder}`, `--load-extension=${extensionFolder}`],
});
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.goto(worker.url().replace('background.js', 'library.html') + '#settings');
  await expect(page.locator('[data-drive-connect]')).toBeEnabled();
  const capabilities = await page.evaluate(async () => ({
    isBrave: !!navigator.brave && (await navigator.brave.isBrave()),
    version: navigator.userAgent,
    redirect: chrome.identity.getRedirectURL(),
    extensionId: chrome.runtime.id,
    sidePanel: !!chrome.sidePanel?.open,
    speechRecognition: !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition),
    localTranslator: !!globalThis.Translator,
    microphone: !!navigator.mediaDevices?.getUserMedia,
    mediaRecorder: !!globalThis.MediaRecorder,
    readAloud: !!globalThis.speechSynthesis,
  }));
  if (browserTarget === 'brave') assert.equal(capabilities.isBrave, true);
  assert.equal(capabilities.microphone, true);
  assert.equal(capabilities.mediaRecorder, true);
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'test-sidebar';
    button.textContent = 'Open sidebar';
    button.style.cssText = 'position:fixed;right:5px;top:5px;z-index:999999';
    button.onclick = () =>
      chrome.tabs
        .getCurrent()
        .then((tab) => chrome.sidePanel.open({ tabId: tab.id }))
        .then(
          () => (button.dataset.opened = 'true'),
          (error) => (button.dataset.error = error.message),
        );
    document.body.prepend(button);
  });
  await page.locator('#test-sidebar').click();
  await expect(page.locator('#test-sidebar')).toHaveAttribute('data-opened', 'true');
  capabilities.nativeSidebarOpened = true;
  const results = path.resolve('test-results', browserTarget);
  await mkdir(results, { recursive: true });
  await writeFile(
    path.join(results, 'capabilities.json'),
    JSON.stringify({ passed: true, ...capabilities }, null, 2),
  );
  console.log(JSON.stringify(capabilities, null, 2));
} finally {
  await context.close();
}
