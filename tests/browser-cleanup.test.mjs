import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeTestBrowser } from './browser-cleanup.mjs';

test('successful browser shutdown returns normally', async () => {
  let closed = false;
  await closeTestBrowser(
    {
      close: async () => {
        closed = true;
      },
    },
    true,
    100,
  );
  assert.equal(closed, true);
});
test('browser shutdown rejection preserves the cleanup failure', async () => {
  await assert.rejects(
    closeTestBrowser(
      {
        close: async () => {
          throw new Error('shutdown failed');
        },
      },
      true,
      100,
    ),
    /shutdown failed/,
  );
});
for (const passed of [false, true]) {
  test('stalled shutdown preserves test outcome: ' + passed, () => {
    const source =
      'import { closeTestBrowser } from ' +
      JSON.stringify(new URL('./browser-cleanup.mjs', import.meta.url).href) +
      '; await closeTestBrowser({close:()=>new Promise(()=>{})}, ' +
      passed +
      ', 25);';
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, passed ? 0 : 1);
    assert.match(result.stderr, /shutdown exceeded its deadline/);
  });
}
