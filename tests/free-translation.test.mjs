import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { freeGoogleTranslate, libreTranslate } from '../src/translation-providers.js';
import { backupSnapshot, clearTranslationCache } from '../src/db.js';

const endpoint = 'https://script.google.com/macros/s/test-relay/exec';
const input = { text: 'Hello', source: 'auto', target: 'fa' };

test('the free relay caches Persian output on the device and clears it on request', async () => {
  let calls = 0;
  const fetcher = async (url, request) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(request.method, 'POST');
    assert.equal(request.credentials, 'omit');
    assert.equal(request.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(request.body), input);
    return Response.json({ ok: true, text: 'سلام' });
  };
  const first = await freeGoogleTranslate(input, { endpoint, fetcher });
  assert.deepEqual(first, {
    text: 'سلام',
    source: 'auto',
    target: 'fa',
    provider: 'Google Translate (free relay)',
  });
  assert.deepEqual(await freeGoogleTranslate(input, { endpoint, fetcher }), {
    ...first,
    cached: true,
  });
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(await backupSnapshot()).includes('سلام'));
  await clearTranslationCache();
  await freeGoogleTranslate(input, { endpoint, fetcher });
  assert.equal(calls, 2);
});

test('the relay falls back only on quota and LibreTranslate cannot redirect selected text', async () => {
  const values = { ...input, text: 'Another passage' };
  const quota = async () => Response.json({ ok: false, code: 'quota' });
  await assert.rejects(freeGoogleTranslate(values, { endpoint, fetcher: quota }), /quota is full/);
  let calls = 0;
  const fallback = (options) =>
    libreTranslate(options, async (url, request) => {
      calls++;
      assert.equal(url, 'http://127.0.0.1:5000/translate');
      assert.equal(request.redirect, 'error');
      assert.equal(request.credentials, 'omit');
      assert.deepEqual(JSON.parse(request.body), {
        q: values.text,
        source: 'auto',
        target: 'fa',
        format: 'text',
      });
      return Response.json({ translatedText: 'یک متن دیگر', detectedLanguage: { language: 'en' } });
    });
  await assert.rejects(
    freeGoogleTranslate(values, {
      endpoint,
      fetcher: async () => Response.json({ ok: false, code: 'busy' }),
      fallback,
    }),
    /busy/,
  );
  assert.equal(calls, 0);
  const translated = await freeGoogleTranslate(values, { endpoint, fetcher: quota, fallback });
  assert.equal(calls, 1);
  assert.equal(translated.source, 'en');
  assert.equal(translated.target, 'fa');
  assert.equal(translated.provider, 'LibreTranslate (on this device)');
  const signal = AbortSignal.abort();
  await assert.rejects(
    freeGoogleTranslate({ ...values, signal }, { endpoint, fetcher: quota, fallback }),
    { name: 'AbortError' },
  );
  assert.equal(calls, 1);
});

test('the Apps Script relay validates requests, reserves the shared quota, and stores counters only', async () => {
  const source = await readFile(
    new URL('../scripts/translation-relay.gs', import.meta.url),
    'utf8',
  );
  let time = 1000;
  let counters = JSON.stringify({ count: 4999, resetAt: 2000 });
  let unlocked = false;
  const calls = [];
  const handler = runInNewContext(source + '\ndoPost', {
    Date: { now: () => time },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {
          unlocked = true;
        },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => counters,
        setProperty: (_key, value) => {
          counters = value;
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ setMimeType: () => text }),
    },
    LanguageApp: {
      translate: (...args) => {
        assert.equal(unlocked, true);
        calls.push(args);
        return 'سلام';
      },
    },
  });
  const call = (value) => JSON.parse(handler({ postData: { contents: JSON.stringify(value) } }));
  assert.deepEqual(call({ ...input, text: 'x'.repeat(5001) }), { ok: false, code: 'invalid' });
  assert.equal(JSON.parse(counters).count, 4999);
  assert.deepEqual(call(input), { ok: true, text: 'سلام' });
  assert.deepEqual(calls, [['Hello', '', 'fa']]);
  assert.deepEqual(call(input), { ok: false, code: 'quota' });
  assert.deepEqual(JSON.parse(counters), { count: 5000, resetAt: 2000 });
  time = 2001;
  assert.deepEqual(call(input), { ok: true, text: 'سلام' });
  assert.equal(JSON.parse(counters).count, 1);
});
