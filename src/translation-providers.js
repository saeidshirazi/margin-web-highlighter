import { validateTranslation } from './translation.js';
import { translationCache, saveTranslationCache } from './db.js';

export const translationRelayUrl =
  typeof __MARGIN_TRANSLATION_RELAY_URL__ === 'string' ? __MARGIN_TRANSLATION_RELAY_URL__ : '';
export const translationRelayOrigins = [
  'https://script.google.com/*',
  'https://script.googleusercontent.com/*',
];
export const libreTranslateOrigin = 'http://127.0.0.1/*';
const libreEndpoint = 'http://127.0.0.1:5000/translate';

function providerLanguage(code, google = false) {
  if (code === 'auto') return code;
  const locale = new Intl.Locale(code);
  if (locale.language === 'zh') {
    const traditional = locale.script === 'Hant' || ['TW', 'HK', 'MO'].includes(locale.region);
    return google ? (traditional ? 'zh-TW' : 'zh-CN') : traditional ? 'zt' : 'zh';
  }
  return locale.language;
}

function post(body, signal, local = false) {
  return {
    method: 'POST',
    headers: { 'Content-Type': local ? 'application/json' : 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: local ? 'error' : 'follow',
    signal,
  };
}

export async function libreTranslate(options, fetcher = fetch) {
  const { text, source, target } = validateTranslation(
    options.text,
    options.target,
    options.source,
  );
  let response;
  try {
    response = await fetcher(
      libreEndpoint,
      post(
        {
          q: text,
          source: providerLanguage(source),
          target: providerLanguage(target),
          format: 'text',
        },
        options.signal,
        true,
      ),
    );
  } catch (error) {
    options.signal?.throwIfAborted();
    throw new Error('Could not reach LibreTranslate. Start it on this device at 127.0.0.1:5000.', {
      cause: error,
    });
  }
  const data = await response.json().catch(() => null);
  options.signal?.throwIfAborted();
  if (!response.ok || typeof data?.translatedText !== 'string' || !data.translatedText.trim())
    throw new Error(
      'LibreTranslate could not translate this selection. Check that both language models are installed.',
    );
  return {
    text: data.translatedText,
    source: data.detectedLanguage?.language || source,
    target,
    provider: 'LibreTranslate (on this device)',
  };
}

export async function freeGoogleTranslate(
  options,
  { fetcher = fetch, fallback, endpoint = translationRelayUrl } = {},
) {
  if (!endpoint)
    throw new Error('The free Google translator has not been configured in this build.');
  const values = validateTranslation(options.text, options.target, options.source);
  const { text, source, target } = values;
  if ([...text].length > 5000)
    throw new Error('The free Google translator accepts up to 5,000 characters per request.');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([endpoint, source, target, text])),
  );
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  const cached = await translationCache(key).catch(() => null);
  options.signal?.throwIfAborted();
  if (cached) return { ...cached, cached: true };
  const response = await fetcher(
    endpoint,
    post(
      {
        text,
        source: providerLanguage(source, true),
        target: providerLanguage(target, true),
      },
      options.signal,
    ),
  );
  const data = await response.json().catch(() => null);
  options.signal?.throwIfAborted();
  if (response.status === 429 || data?.code === 'quota') {
    if (fallback) return fallback({ ...values, signal: options.signal });
    throw new Error(
      'The shared Google translation quota is full. Try again later or choose LibreTranslate on this device.',
    );
  }
  if (data?.code === 'busy')
    throw new Error('The free Google translator is busy. Try again shortly.');
  if (!response.ok || data?.ok !== true || typeof data.text !== 'string' || !data.text.trim())
    throw new Error(
      'The free Google translator could not translate this selection. Check the language pair or try again.',
    );
  const result = { text: data.text, source, target, provider: 'Google Translate (free relay)' };
  await saveTranslationCache(key, result).catch(() => {});
  options.signal?.throwIfAborted();
  return result;
}
