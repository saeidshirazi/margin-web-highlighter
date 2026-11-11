import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { zipArchive } from '../scripts/archive-files.mjs';

test('release archives normalize text endings and ordering without changing binary data', () => {
  const e = new TextEncoder(),
    binary = new Uint8Array([0, 255, 13, 10]);
  assert.deepEqual(
    zipArchive({ 'test.js': e.encode('hello\r\n'), 'icon.png': binary }),
    zipArchive({ 'icon.png': binary, 'test.js': e.encode('hello\n') }),
  );
});
test('release archive bytes do not depend on build timezone', () => {
  const source =
    'import { zipArchive } from ' +
    JSON.stringify(new URL('../scripts/archive-files.mjs', import.meta.url).href) +
    ";process.stdout.write(Buffer.from(zipArchive({'x.js':new Uint8Array([65])})).toString('hex'));";
  const build = (TZ) =>
    execFileSync(process.execPath, ['--input-type=module', '-e', source], {
      env: { ...process.env, TZ },
      encoding: 'utf8',
    });
  const utc = build('UTC');
  assert.equal(build('America/Toronto'), utc);
  assert.equal(build('Asia/Tokyo'), utc);
});
