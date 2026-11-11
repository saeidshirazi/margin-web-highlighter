import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { archiveFiles, zipArchive } from './archive-files.mjs';
import { scratchDirectory } from './scratch-directory.mjs';

export function chromeStoreArchive(files, version) {
  assert.ok(files['manifest.json'], 'manifest.json must be at the archive root');
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
  assert.equal(manifest.version, version);
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.background?.service_worker, 'Expected a Chrome service worker');
  assert.equal(manifest.browser_specific_settings, undefined);
  assert.equal(
    manifest.key,
    undefined,
    'Chrome Store uploads must not contain a development identity',
  );
  assert.equal(manifest.oauth2, undefined, 'Use only the public web OAuth registration');
  const entries = Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const bytes = zipArchive(files);
  const verified = unzipSync(bytes);
  assert.deepEqual(Object.keys(verified).sort(), Object.keys(files).sort());
  for (const [name, data] of entries) {
    const actual = verified[name];
    if (/\.(?:js|mjs|json|html|css|svg|md|yml|ps1|txt)$|(?:^|\/)LICENSE$/.test(name))
      assert.equal(
        new TextDecoder().decode(actual),
        new TextDecoder().decode(data).replace(/\r\n/g, '\n'),
        name,
      );
    else assert.deepEqual(actual, new Uint8Array(data), name);
  }
  return bytes;
}

export async function packageChromeStore(folder = path.join('release', 'store')) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  await using scratch = await scratchDirectory('chrome-store');
  execFileSync(
    process.execPath,
    [
      'scripts/build.mjs',
      '--target=chrome',
      '--public',
      '--chrome-web-store',
      '--outdir=' + scratch.path,
    ],
    { stdio: 'inherit' },
  );
  const bytes = chromeStoreArchive(await archiveFiles(scratch.path), version);
  await mkdir(folder, { recursive: true });
  const filename = 'margin-' + version + '-chrome-web-store.zip';
  const output = path.join(folder, filename);
  const digest = createHash('sha256').update(bytes).digest('hex');
  try {
    await writeFile(output, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert.equal(
      createHash('sha256')
        .update(await readFile(output))
        .digest('hex'),
      digest,
      'A different archive already exists; use a new version',
    );
  }
  await writeFile(output + '.sha256', digest + '  ' + filename + '\n');
  console.log('Verified Chrome Web Store upload: ' + output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await packageChromeStore();
