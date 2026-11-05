import { languageCode, languageName } from './languages.js';

// Chrome's published on-device language list, checked 2026-11-02.
// Do not probe known unsupported pairs: Chrome logs a warning even when availability resolves.
// https://developer.chrome.com/docs/ai/translator-api#supported_languages
const LOCAL_TRANSLATION_LANGUAGES = new Set(
  'ar bg bn cs da de el en es fi fr he hi hr hu id it ja kn ko lt mr nl no pl pt ro ru sk sl sv ta te th tr uk vi zh zh-Hant'.split(
    ' ',
  ),
);
export function localLanguage(value) {
  const tag = new Intl.Locale(languageCode(value));
  if (tag.language === 'zh')
    return tag.script === 'Hant' || ['TW', 'HK', 'MO'].includes(tag.region) ? 'zh-Hant' : 'zh';
  if (tag.language === 'nb') return 'no';
  return tag.language;
}
export function localTranslationSupport(target, source = 'auto') {
  const targetLanguage = localLanguage(target),
    sourceLanguage = source === 'auto' ? 'auto' : localLanguage(source);
  const unsupported = [...(sourceLanguage === 'auto' ? [] : [sourceLanguage]), targetLanguage].find(
    (code) => !LOCAL_TRANSLATION_LANGUAGES.has(code),
  );
  return {
    supported: !unsupported,
    source: sourceLanguage,
    target: targetLanguage,
    message: unsupported
      ? `${languageName(unsupported)} (${unsupported}) is not supported by Chrome’s on-device translator. Choose Google Translate or LibreTranslate instead.`
      : '',
  };
}
export function languageFailure(error, message) {
  if (
    /requested language options|language.{0,30}not supported|unsupported.{0,15}language|language-not-supported/i.test(
      String(error?.message || error),
    )
  )
    return new Error(message);
  return error;
}
