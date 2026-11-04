import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { browserManifest } from '../scripts/browser-manifest.mjs';
import { openSidebar } from '../src/platform.js';
test('browser builds use their correct background, sidebar, ID and consent declarations', async () => {
  const base = JSON.parse(await readFile('public/manifest.json')),
    ids = JSON.parse(await readFile('config/browser-ids.json'));
  const firefox = browserManifest(base, 'firefox', {}, ids),
    edge = browserManifest(base, 'edge', {}, ids);
  assert.equal(firefox.background.service_worker, undefined);
  assert.deepEqual(firefox.background.scripts, ['background.js']);
  assert.equal(firefox.sidebar_action.default_panel, 'panel.html');
  assert.equal(firefox.side_panel, undefined);
  assert.equal(firefox.permissions.includes('sidePanel'), false);
  assert.ok(firefox.browser_specific_settings.gecko.id);
  assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, [
    'none',
  ]);
  assert.equal(edge.background.service_worker, 'background.js');
  assert.equal(edge.key, ids.edgeKey);
  assert.equal(edge.oauth2, undefined);
  const brave = browserManifest(base, 'brave', {}, ids);
  assert.deepEqual(brave, edge);
  assert.equal(base.side_panel.default_path, 'panel.html');
  assert.equal(base.key, undefined);
  const publicChrome = browserManifest(
    base,
    'chrome',
    { clientId: '123-private-build.apps.googleusercontent.com', extensionKey: 'local-public-key' },
    ids,
    { publicBuild: true },
  );
  assert.equal(publicChrome.oauth2, undefined);
  assert.equal(publicChrome.key, undefined);
});
test('sidebar buttons invoke Firefox or Chromium native APIs without requiring an async bridge', async () => {
  const calls = [];
  await openSidebar(42, { sidebarAction: { open: () => calls.push('firefox') } });
  await openSidebar(42, { sidePanel: { open: (options) => calls.push(options) } });
  assert.deepEqual(calls, ['firefox', { tabId: 42 }]);
});
