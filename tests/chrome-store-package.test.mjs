import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { chromeStoreArchive } from '../scripts/package-chrome-store.mjs';

const version = '1.2.3';
const base = {
  manifest_version: 3,
  version,
  background: { service_worker: 'background.js', type: 'module' },
};
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));
test('store archive preserves code and binary assets and puts the manifest at its root', () => {
  const files = {
    'manifest.json': bytes(base),
    'background.js': bytes('same code'),
    'icons/128.png': new Uint8Array([0, 255, 13, 10]),
  };
  const archive = unzipSync(chromeStoreArchive(files, version));
  for (const name of Object.keys(files)) assert.deepEqual(archive[name], files[name]);
  assert.equal(JSON.parse(new TextDecoder().decode(archive['manifest.json'])).version, version);
});
test('store packaging rejects a conflicting identity, private native OAuth and stale versions', () => {
  assert.throws(
    () =>
      chromeStoreArchive({ 'manifest.json': bytes({ ...base, key: 'development-key' }) }, version),
    /development identity/,
  );
  assert.throws(
    () =>
      chromeStoreArchive(
        { 'manifest.json': bytes({ ...base, oauth2: { client_id: 'local' } }) },
        version,
      ),
    /public web OAuth/,
  );
  assert.throws(() => chromeStoreArchive({ 'manifest.json': bytes(base) }, '1.2.4'));
});
