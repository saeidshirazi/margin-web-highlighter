import { languageCode } from './languages.js';
import { localTranslationSupport, languageFailure } from './local-language-support.js';
export const GOOGLE_ORIGIN = 'https://translation.googleapis.com/*';
export const GOOGLE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
export function validateTranslation(text, target, source = 'auto') {
  if (!String(text || '').trim()) throw new Error('Add text to translate.');
  if ([...text].length > 20000)
    throw new Error('Translate up to 20,000 characters at a time. Select a shorter passage.');
  return { text: String(text), target: languageCode(target), source: languageCode(source, true) };
}
export async function googleTranslate(
  { text, target, source = 'auto', apiKey, signal },
  fetcher = fetch,
) {
  ({ text, target, source } = validateTranslation(text, target, source));
  if (!String(apiKey || '').trim()) throw new Error('Enter your Google Cloud Translation API key.');
  const response = await fetcher(GOOGLE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey.trim() },
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
    body: JSON.stringify({
      q: text,
      target,
      ...(source !== 'auto' ? { source } : {}),
      format: 'text',
    }),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Google returned an unreadable response. Try again.');
  }
  if (!response.ok) {
    const messages = {
      400: 'Google could not translate this language or text. Check the language codes.',
      401: 'Google rejected the API key.',
      403: 'Google denied this request. Check API activation, key restrictions, and billing in your Google Cloud project.',
      429: 'Google’s translation quota was reached. Try later or check your project quota.',
    };
    throw new Error(
      messages[response.status] || 'Google translation failed (HTTP ' + response.status + ').',
    );
  }
  const item = data?.data?.translations?.[0];
  if (typeof item?.translatedText !== 'string') throw new Error('Google returned no translation.');
  // format:text requests plain text; render using textContent, never as returned HTML.
  return {
    text: item.translatedText,
    source: item.detectedSourceLanguage || source,
    target,
    provider: 'Google Cloud',
  };
}
export async function localTranslate(options, env = globalThis) {
  const validated = validateTranslation(options.text, options.target, options.source);
  const support = localTranslationSupport(validated.target, validated.source);
  if (!support.supported) throw new Error(support.message);
  try {
    return await performLocalTranslation(options, env);
  } catch (error) {
    throw languageFailure(
      error,
      'These languages are not supported by Chrome’s on-device language tools on this device. Choose Google Translate or LibreTranslate, or select another language pair.',
    );
  }
}
async function performLocalTranslation(
  { text, target, source = 'auto', signal, progress = () => {} },
  env = globalThis,
) {
  ({ text, target, source } = validateTranslation(text, target, source));
  if (!env.Translator)
    throw new Error(
      'Chrome’s on-device translator is unavailable. Choose Google Translate or LibreTranslate.',
    );
  const monitor = (m) =>
    m.addEventListener('downloadprogress', (e) =>
      progress('Preparing local language model: ' + Math.round(e.loaded * 100) + '%'),
    );
  if (source === 'auto') {
    if (!env.LanguageDetector)
      throw new Error(
        'Automatic local detection is unavailable. Choose the source language or use another translation provider.',
      );
    if ((await env.LanguageDetector.availability()) === 'unavailable')
      throw new Error(
        'Local language detection is unavailable on this device. Choose the source language.',
      );
    progress('Detecting source language locally…');
    const detector = await env.LanguageDetector.create({ monitor, signal });
    try {
      const detected = await detector.detect(text, { signal });
      if (
        !detected[0]?.detectedLanguage ||
        detected[0].detectedLanguage === 'und' ||
        detected[0].confidence < 0.25
      )
        throw new Error('The source language is uncertain. Choose it manually.');
      source = localTranslationSupport(target, detected[0].detectedLanguage).source;
    } finally {
      detector.destroy();
    }
  }
  const detectedSupport = localTranslationSupport(target, source);
  if (!detectedSupport.supported) throw new Error(detectedSupport.message);
  source = detectedSupport.source;
  const localTarget = detectedSupport.target;
  if (source === localTarget) return { text, source, target, provider: 'On-device' };
  const options = { sourceLanguage: source, targetLanguage: localTarget };
  try {
    if ((await env.Translator.availability(options)) === 'unavailable')
      throw new Error(
        'This language pair is not supported by Chrome’s local translator. Choose Google Translate or LibreTranslate.',
      );
    progress('Preparing on-device translation…');
    const translator = await env.Translator.create({ ...options, monitor, signal });
    try {
      return {
        text: await translator.translate(text, { signal }),
        source,
        target,
        provider: 'On-device',
      };
    } finally {
      translator.destroy();
    }
  } catch (error) {
    throw languageFailure(
      error,
      'This language pair is not supported by Chrome’s on-device translator on this device. Choose Google Translate or LibreTranslate instead.',
    );
  }
}
