import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup } from '../src/backup.js';
test('encrypted backups round-trip and reject wrong passwords and tampering', async () => {
  const data = { format: 'margin-backup', version: 1, pages: [{ title: 'Private research' }] };
  const sealed = await encryptBackup(data, 'a long personal passphrase');
  assert.ok(!JSON.stringify(sealed).includes('Private research'));
  assert.deepEqual(await decryptBackup(sealed, 'a long personal passphrase'), data);
  await assert.rejects(decryptBackup(sealed, 'wrong password'));
  await assert.rejects(
    decryptBackup(
      { ...sealed, data: sealed.data.slice(0, -8) + 'AAAAAAAA' },
      'a long personal passphrase',
    ),
  );
});
