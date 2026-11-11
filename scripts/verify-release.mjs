import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import assert from 'node:assert/strict';
import path from 'node:path';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const directory = path.join('release', 'public', `v${version}`);
const registration = JSON.parse(await readFile('config/google-oauth.public.json', 'utf8'));
const relay = JSON.parse(await readFile('config/translation-relay.public.json', 'utf8'));
const ids = JSON.parse(await readFile('config/browser-ids.json', 'utf8'));
const publicClient = registration.enabled === true ? registration.webClientId : '';
const checksums = [];
for (const suffix of [
  'chrome.zip',
  'chrome-web-store.zip',
  'edge.zip',
  'brave.zip',
  'firefox-unsigned.xpi',
  'source.zip',
]) {
  const name = `margin-${version}-${suffix}`;
  const bytes = await readFile(path.join(directory, name));
  const archive = unzipSync(bytes),
    names = Object.keys(archive);
  assert.ok(
    !names.some((file) =>
      /(^|\/)(google-oauth\.local\.json|node_modules|work|test-results|\.git)(\/|$)/.test(file),
    ),
  );
  assert.ok(!names.some((file) => file.includes('fixture-bootstrap')));
  if (suffix === 'source.zip') {
    assert.ok(names.includes('README.md') && names.includes('docs/INSTALL.md'));
    assert.ok(names.includes('config/translation-relay.public.json'));
    assert.ok(names.includes('scripts/translation-relay.gs'));
    assert.ok(!names.some((file) => /^dist(?:-[^/]+)?\//.test(file)));
  } else {
    const manifest = JSON.parse(strFromU8(archive['manifest.json']));
    assert.equal(manifest.version, version);
    assert.equal(manifest.oauth2, undefined);
    const background = strFromU8(archive['background.js']);
    assert.ok(!background.includes('fixture-only-no-google-access'));
    assert.ok(!background.includes('123-ci-fixture.apps.googleusercontent.com'));
    if (publicClient)
      assert.ok(background.includes(publicClient), 'Public web registration missing');
    if (relay.url)
      assert.ok(strFromU8(archive['library.js']).includes(relay.url), 'Public relay URL missing');
    if (suffix.startsWith('firefox')) {
      assert.deepEqual(manifest.background.scripts, ['background.js']);
      assert.ok(manifest.sidebar_action);
      assert.equal(manifest.key, undefined);
    } else {
      if (suffix === 'chrome-web-store.zip')
        assert.equal(manifest.key, undefined, 'Store package contains a development identity');
      else if (publicClient)
        assert.equal(manifest.key, ids.edgeKey, 'Public callback identity changed');
      assert.equal(manifest.background.service_worker, 'background.js');
      assert.ok(manifest.side_panel);
    }
    for (const asset of [
      'library.html',
      'content.js',
      'icons/128.png',
      'THIRD_PARTY_NOTICES.txt',
      'proofreading-worker.js',
      'harper_wasm_slim_bg.wasm',
    ])
      assert.ok(names.includes(asset));
  }
  checksums.push(createHash('sha256').update(bytes).digest('hex') + '  ' + name);
  console.log(`Verified ${name}: ${names.length} files`);
}
const checksumPath = path.join(directory, 'SHA256SUMS.txt');
const checksumText = checksums.join('\n') + '\n';
try {
  await writeFile(checksumPath, checksumText, { flag: 'wx' });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  assert.equal(
    (await readFile(checksumPath, 'utf8')).replace(/\r\n/g, '\n'),
    checksumText,
    'Existing checksums do not match the release archives',
  );
}
