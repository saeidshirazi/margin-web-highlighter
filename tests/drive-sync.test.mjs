import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/core.js';
import { createDriveSync, SYNC_ALARM } from '../src/drive-sync.js';
import { DRIVE_SCOPE } from '../src/drive-client.js';
function device(shared, note = '', account = 'account-a') {
  let backup = {
    format: 'margin-backup',
    version: 2,
    pages: note
      ? [
          {
            id: crypto.randomUUID(),
            url: 'https://example.com/source',
            title: 'Source',
            note,
            tags: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ]
      : [],
    highlights: [],
    cards: [],
    assets: [],
    settings: { ...DEFAULT_SETTINGS },
  };
  const settings = new Map(),
    local = {},
    alarms = new Map();
  const fixture = { failWrite: false, account, onList: undefined, writes: 0 };
  const db = {
    backupSnapshot: async () => structuredClone(backup),
    get: async (_store, id) => structuredClone(settings.get(id)),
    put: async (_store, value) => settings.set(value.id, structuredClone(value)),
    applySyncedBackup: async (next, journal) => {
      backup = structuredClone(next);
      settings.set('drive-journal', { value: structuredClone(journal) });
    },
  };
  const chromeApi = {
    runtime: {
      id: 'extension-a',
      getManifest: () => ({
        oauth2: { client_id: '123-client.apps.googleusercontent.com', scopes: [DRIVE_SCOPE] },
      }),
    },
    permissions: { contains: async () => true },
    storage: {
      local: {
        get: async () => structuredClone(local),
        set: async (patch) => Object.assign(local, structuredClone(patch)),
      },
    },
    alarms: {
      create: async (name, value) => alarms.set(name, value),
      get: async (name) => alarms.get(name),
      clear: async (name) => alarms.delete(name),
    },
    identity: { clearAllCachedAuthTokens: async () => {} },
  };
  const sync = createDriveSync({
    db,
    chromeApi,
    serialize: (fn) => fn(),
    clientFactory: () => ({
      account: async () => ({ id: fixture.account, email: fixture.account + '@example.test' }),
      list: async () => {
        await fixture.onList?.();
        return [...shared.keys()].map((id) => ({ id, appProperties: { device: id } }));
      },
      read: async (file) => structuredClone(shared.get(file.id)),
      write: async (state) => {
        fixture.writes++;
        if (fixture.failWrite) throw new Error('Offline upload');
        shared.set(state.device, structuredClone(state));
        return state.device;
      },
    }),
  });
  return { sync, fixture, alarms, data: () => structuredClone(backup), edit: (fn) => fn(backup) };
}
async function finish(sync, type = 'drive-now') {
  await sync.handle(type);
  await sync.idle();
  return sync.status();
}
test('two devices sync offline edits, settings, and deletions without stale resurrection', async () => {
  const shared = new Map(),
    a = device(shared, 'Research A'),
    b = device(shared);
  assert.equal((await finish(a.sync, 'drive-connect')).phase, 'ready');
  assert.ok(a.alarms.has(SYNC_ALARM));
  await finish(b.sync, 'drive-connect');
  assert.equal(b.data().pages[0].note, 'Research A');
  b.edit((data) => {
    data.pages[0].note = 'Offline edit B';
    data.settings.translationTarget = 'fr';
  });
  await finish(b.sync);
  await finish(a.sync);
  assert.equal(a.data().pages[0].note, 'Offline edit B');
  assert.equal(a.data().settings.translationTarget, 'fr');
  a.edit((data) => {
    data.pages = [];
  });
  await finish(a.sync);
  await finish(b.sync);
  assert.equal(b.data().pages.length, 0);
  await finish(a.sync);
  assert.equal(a.data().pages.length, 0);
});
test('edits made during downloads survive apply and upload', async () => {
  const shared = new Map(),
    a = device(shared, 'Original');
  await finish(a.sync, 'drive-connect');
  a.fixture.onList = async () =>
    a.edit((data) => {
      data.pages[0].note = 'Typed during sync';
    });
  await finish(a.sync);
  assert.equal(a.data().pages[0].note, 'Typed during sync');
  const b = device(shared);
  await finish(b.sync, 'drive-connect');
  assert.equal(b.data().pages[0].note, 'Typed during sync');
});
test('upload failure keeps local edits for retry and pause/disconnect preserve data', async () => {
  const a = device(new Map(), 'Important');
  a.fixture.failWrite = true;
  assert.equal((await finish(a.sync, 'drive-connect')).phase, 'error');
  assert.equal(a.data().pages[0].note, 'Important');
  assert.ok(a.alarms.has(SYNC_ALARM));
  a.fixture.failWrite = false;
  assert.equal((await finish(a.sync)).phase, 'ready');
  await a.sync.handle('drive-pause');
  assert.equal((await a.sync.status()).enabled, false);
  assert.equal(a.alarms.has(SYNC_ALARM), false);
  await a.sync.handle('drive-disconnect');
  assert.equal((await a.sync.status()).connected, false);
  assert.equal(a.data().pages.length, 1);
});
test('account changes never upload the previous account’s library', async () => {
  const a = device(new Map(), 'Private');
  await finish(a.sync, 'drive-connect');
  const writes = a.fixture.writes;
  a.fixture.account = 'other-account';
  const state = await finish(a.sync);
  assert.equal(state.phase, 'error');
  assert.match(state.message, /different Google account/);
  assert.equal(a.fixture.writes, writes);
  assert.equal(a.data().pages[0].note, 'Private');
});
test('corrupt remote files abort before applying any remote changes', async () => {
  const shared = new Map(),
    a = device(shared, 'Safe');
  await finish(a.sync, 'drive-connect');
  shared.set('broken', { format: 'unexpected' });
  assert.equal((await finish(a.sync)).phase, 'error');
  assert.equal(a.data().pages[0].note, 'Safe');
});
