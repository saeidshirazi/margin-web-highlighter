import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localTranslate } from '../src/translation.js';
import { speechAvailability } from '../src/speech.js';
import { localLanguage, localTranslationSupport } from '../src/local-language-support.js';
import { localAI } from '../src/ai.js';

test('unsupported languages are rejected before any native model probe', async () => {
  let probes = 0;
  const env = {
    Translator: {
      availability() {
        probes++;
        throw new Error('The requested language options are not supported.');
      },
    },
    LanguageDetector: {
      availability() {
        probes++;
      },
    },
  };
  await assert.rejects(localTranslate({ text: 'Hello', target: 'fa' }, env), /Persian/);
  await assert.rejects(
    localTranslate({ text: 'Hello', source: 'fa', target: 'en' }, env),
    /not supported/,
  );
  await assert.rejects(localTranslate({ text: 'Hello', target: 'zz' }, env), /not supported/);
  assert.equal(probes, 0);
});
test('local model language codes normalize regional and Chinese script variants', () => {
  assert.equal(localLanguage('en-US'), 'en');
  assert.equal(localLanguage('zh-TW'), 'zh-Hant');
  assert.equal(localLanguage('zh-Hans-CN'), 'zh');
  assert.ok(localTranslationSupport('fr-FR', 'en-US').supported);
});
test('native language errors are actionable and cancellation stays cancellation', async () => {
  const error = new DOMException(
    'The requested language options are not supported.',
    'NotSupportedError',
  );
  await assert.rejects(
    localTranslate(
      { text: 'Hello', target: 'fr', source: 'en' },
      {
        Translator: {
          availability: async () => {
            throw error;
          },
        },
      },
    ),
    (e) => e.message.includes('Choose Google') && !e.message.includes('requested language options'),
  );
  await assert.rejects(
    localTranslate(
      { text: 'Hello', target: 'fr' },
      {
        Translator: {},
        LanguageDetector: {
          availability: async () => 'available',
          create: async () => {
            throw error;
          },
        },
      },
    ),
    /Choose Google/,
  );
  const available = await speechAvailability('fa-IR', {
    SpeechRecognition: class {
      constructor() {
        throw error;
      }
    },
  });
  assert.equal(available.ready, false);
  assert.match(available.message, /spoken language/);
  const abort = new DOMException('Cancelled', 'AbortError');
  await assert.rejects(
    localTranslate(
      { text: 'Hello', target: 'fr', source: 'en' },
      {
        Translator: {
          availability: async () => {
            throw abort;
          },
        },
      },
    ),
    (e) => e === abort,
  );
});
test('summaries use the same explicit supported output language for probe and creation', async () => {
  const original = globalThis.Summarizer,
    calls = [];
  try {
    globalThis.Summarizer = {
      availability: async (options) => {
        calls.push(options);
        return 'available';
      },
      create: async (options) => {
        calls.push(options);
        return { summarize: async () => 'Summary', destroy() {} };
      },
    };
    assert.equal(await localAI('summary', 'English source text.'), 'Summary');
    assert.equal(calls[0].outputLanguage, 'en');
    assert.equal(calls[1].outputLanguage, 'en');
  } finally {
    if (original === undefined) delete globalThis.Summarizer;
    else globalThis.Summarizer = original;
  }
});
