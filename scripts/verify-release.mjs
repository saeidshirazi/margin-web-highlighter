import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import assert from 'node:assert/strict';
import path from 'node:path';

const directory = 'release/public';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const checksums = [];
let local = {};
try {
  local = JSON.parse(await readFile('google-oauth.local.json', 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const suffix of [
  'chrome.zip',
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
    assert.ok(!names.some((file) => /^dist(?:-[^/]+)?\//.test(file)));
  } else {
    const manifest = JSON.parse(strFromU8(archive['manifest.json']));
    assert.equal(manifest.version, version);
    assert.equal(manifest.oauth2, undefined);
    const background = strFromU8(archive['background.js']);
    assert.ok(!background.includes('fixture-only-no-google-access'));
    assert.ok(!background.includes('123-ci-fixture.apps.googleusercontent.com'));
    for (const id of [local.clientId, local.webClientId].filter(Boolean))
      assert.ok(!background.includes(id), 'Public build contains a local OAuth client');
    if (suffix.startsWith('firefox')) {
      assert.deepEqual(manifest.background.scripts, ['background.js']);
      assert.ok(manifest.sidebar_action);
      assert.equal(manifest.key, undefined);
    } else {
      assert.equal(manifest.background.service_worker, 'background.js');
      assert.ok(manifest.side_panel);
    }
    for (const asset of ['library.html', 'content.js', 'icons/128.png', 'THIRD_PARTY_NOTICES.txt'])
      assert.ok(names.includes(asset));
  }
  checksums.push(createHash('sha256').update(bytes).digest('hex') + '  ' + name);
  console.log(`Verified ${name}: ${names.length} files`);
}
assert.ok((await readdir(directory)).some((name) => name.endsWith('.zip')));
await writeFile(path.join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
