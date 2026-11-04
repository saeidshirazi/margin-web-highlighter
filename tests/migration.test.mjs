import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';
test('database v1 upgrades without losing existing pages and supports audio backups', async () => {
  const old = await new Promise((resolve, reject) => {
    const r = globalThis.indexedDB.open('margin-local', 1);
    r.onupgradeneeded = () => {
      for (const name of ['pages', 'highlights', 'cards', 'settings', 'assets']) {
        const s = r.result.createObjectStore(name, { keyPath: 'id' });
        if (name === 'pages') s.createIndex('url', 'url', { unique: true });
        if (['highlights', 'cards'].includes(name)) s.createIndex('pageId', 'pageId');
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise((resolve, reject) => {
    const tx = old.transaction(['pages', 'assets'], 'readwrite');
    tx.objectStore('pages').put({
      id: 'old',
      url: 'https://example.com/old',
      title: 'Existing page',
      note: 'Keep me',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    });
    tx.objectStore('assets').put({ id: 'old', type: 'application/pdf', base64: 'JVBERi0=' });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  old.close();
  assert.equal((await db.snapshot()).pages[0].note, 'Keep me');
  await db.saveAudioNote({
    id: 'audio:one',
    pageId: 'old',
    type: 'audio/webm',
    base64: 'AQID',
    name: 'Audio',
  });
  assert.equal((await db.audioNotes('old')).length, 1);
  const backup = await db.backupSnapshot();
  assert.equal(backup.version, 2);
  assert.equal(backup.assets.length, 2);
  await db.removePage('old');
  assert.equal((await db.all('assets')).length, 0);
  await db.importBackup(backup);
  await db.importBackup(backup);
  const restored = await db.backupSnapshot();
  assert.equal(restored.pages.length, 1);
  assert.equal(restored.assets.length, 2);
  assert.equal(restored.pages[0].note, 'Keep me');
});
