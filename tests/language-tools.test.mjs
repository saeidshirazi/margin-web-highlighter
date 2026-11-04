import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { languageCode, direction, speechLocale } from '../src/languages.js';
import {
  googleTranslate,
  localTranslate,
  validateTranslation,
  GOOGLE_ENDPOINT,
} from '../src/translation.js';
import { createDictation, insertTranscript } from '../src/speech.js';

test('language preferences accept Persian and regional codes, reject malformed values', () => {
  assert.equal(languageCode('fa'), 'fa');
  assert.equal(languageCode('en-us'), 'en-US');
  assert.equal(direction('fa-IR'), 'rtl');
  assert.equal(direction('de'), 'ltr');
  assert.equal(speechLocale('fa'), 'fa-IR');
  assert.throws(() => languageCode('Persian'));
  assert.throws(() => validateTranslation('', 'fa'));
  assert.throws(() => validateTranslation('x'.repeat(20001), 'fa'));
});
test('Google translation auto-detects source using official endpoint and keeps key out of URL', async () => {
  let request;
  const result = await googleTranslate(
    { text: 'Hello', target: 'fa', apiKey: 'private-test-key' },
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          data: { translations: [{ translatedText: 'سلام', detectedSourceLanguage: 'en' }] },
        }),
      };
    },
  );
  assert.equal(request.url, GOOGLE_ENDPOINT);
  assert.ok(!request.url.includes('private-test-key'));
  assert.equal(request.options.headers['X-Goog-Api-Key'], 'private-test-key');
  assert.deepEqual(JSON.parse(request.options.body), { q: 'Hello', target: 'fa', format: 'text' });
  assert.equal(request.options.credentials, 'omit');
  assert.deepEqual(result, { text: 'سلام', source: 'en', target: 'fa', provider: 'Google Cloud' });
});
test('Google errors never echo response secrets or silently fall back', async () => {
  await assert.rejects(
    googleTranslate({ text: 'Hi', target: 'fa', apiKey: 'secret' }, async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'secret private error' } }),
    })),
    (error) => error.message.includes('Google denied') && !error.message.includes('secret'),
  );
  await assert.rejects(googleTranslate({ text: 'Hi', target: 'fa' }));
});
test('local detection and translator sessions are destroyed and return source identity', async () => {
  let destroyed = 0;
  const env = {
    LanguageDetector: {
      availability: async () => 'available',
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'en', confidence: 0.99 }],
        destroy: () => destroyed++,
      }),
    },
    Translator: {
      availability: async () => 'available',
      create: async (opts) => ({
        translate: async (text) => text + ' translated to ' + opts.targetLanguage,
        destroy: () => destroyed++,
      }),
    },
  };
  const result = await localTranslate({ text: 'Hello', target: 'fr' }, env);
  assert.equal(result.source, 'en');
  assert.equal(result.text, 'Hello translated to fr');
  assert.equal(destroyed, 2);
  env.Translator.availability = async () => 'unavailable';
  await assert.rejects(localTranslate({ text: 'Hello', target: 'fa' }, env), /not supported/);
});
test('final voice transcripts insert at the cursor without replacing surrounding notes', () => {
  const doc = new JSDOM('<textarea>Before after</textarea>').window.document,
    field = doc.querySelector('textarea');
  field.setSelectionRange(7, 7);
  insertTranscript(field, 'spoken words');
  assert.equal(field.value, 'Before spoken words after');
});
function fixture() {
  let instance;
  class Speech {
    processLocally = false;
    static async available() {
      return 'available';
    }
    static async install() {
      return true;
    }
    constructor() {
      instance = this;
    }
    start() {
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
  }
  const field = new JSDOM('<textarea></textarea>').window.document.querySelector('textarea'),
    states = [];
  const controller = createDictation({
    field,
    env: { SpeechRecognition: Speech },
    onState: (s) => states.push(s),
  });
  return {
    field,
    states,
    controller,
    Speech,
    get instance() {
      return instance;
    },
  };
}
test('dictation separates live interim text from final text and avoids duplicate final results', async () => {
  const f = fixture();
  await f.controller.start({ language: 'en-US' });
  assert.equal(f.instance.processLocally, true);
  const interim = [{ transcript: 'live words' }];
  interim.isFinal = false;
  f.instance.onresult({ resultIndex: 0, results: [interim] });
  assert.equal(f.field.value, '');
  assert.equal(f.states.at(-1).message, 'live words');
  const final = [{ transcript: 'final words' }];
  final.isFinal = true;
  f.instance.onresult({ resultIndex: 0, results: [final] });
  f.instance.onresult({ resultIndex: 0, results: [final] });
  assert.equal(f.field.value, 'final words');
  await f.controller.stop();
  assert.equal(f.controller.active, false);
  f.controller.dispose();
});
test('online dictation requires consent and microphone errors remain visible', async () => {
  const f = fixture();
  await assert.rejects(f.controller.start({ language: 'fa-IR', mode: 'browser' }), /Allow online/);
  await f.controller.start({ language: 'fa-IR', mode: 'browser', onlineConsent: true });
  f.instance.onerror({ error: 'not-allowed' });
  f.instance.onend();
  assert.equal(f.states.at(-1).status, 'error');
  assert.match(f.states.at(-1).message, /denied/);
  f.controller.dispose();
});
test('closing a note while local availability is pending never starts its microphone', async () => {
  const f = fixture();
  let resolve;
  f.Speech.available = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = f.controller.start({ language: 'en-US' });
  f.controller.dispose();
  resolve('available');
  await pending;
  assert.equal(f.controller.active, false);
});
