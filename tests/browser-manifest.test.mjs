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
  const registered = browserManifest(
    base,
    'chrome',
    { enabled: true, webClientId: '123-public.apps.googleusercontent.com' },
    ids,
    { publicBuild: true },
  );
  assert.equal(registered.key, ids.edgeKey);
  assert.equal(registered.oauth2, undefined);
});
test('sidebar buttons invoke Firefox or Chromium native APIs without requiring an async bridge', async () => {
  const calls = [];
  await openSidebar(42, { sidebarAction: { open: () => calls.push('firefox') } });
  await openSidebar(42, { sidePanel: { open: (options) => calls.push(options) } });
  assert.deepEqual(calls, ['firefox', { tabId: 42 }]);
});

test('Chrome Store builds omit development identities without changing unpacked builds', async () => {
  const base = JSON.parse(await readFile('public/manifest.json'));
  const ids = JSON.parse(await readFile('config/browser-ids.json'));
  const google = {
    enabled: true,
    webClientId: '123-public.apps.googleusercontent.com',
    clientId: '123-local.apps.googleusercontent.com',
    extensionKey: 'local-key',
  };
  const contaminated = { ...base, key: ids.edgeKey, oauth2: { client_id: google.clientId } };
  const store = browserManifest(contaminated, 'chrome', google, ids, {
    publicBuild: true,
    chromeWebStore: true,
  });
  assert.equal(store.key, undefined);
  assert.equal(store.oauth2, undefined);
  assert.equal(contaminated.key, ids.edgeKey);
  assert.equal(contaminated.oauth2.client_id, google.clientId);
  assert.deepEqual(store.permissions, base.permissions);
  assert.equal(
    browserManifest(base, 'chrome', google, ids, { publicBuild: true }).key,
    ids.edgeKey,
  );
});

test('the store build cannot select another browser or local OAuth registration', () => {
  assert.throws(
    () => browserManifest({}, 'edge', {}, {}, { publicBuild: true, chromeWebStore: true }),
    /public Chrome/,
  );
  assert.throws(
    () => browserManifest({}, 'chrome', {}, {}, { chromeWebStore: true }),
    /public Chrome/,
  );
});
