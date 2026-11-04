import { languageCode } from './languages.js';
import { languageFailure } from './local-language-support.js';
export async function speechAvailability(language, env = globalThis) {
  const Type = env.SpeechRecognition || env.webkitSpeechRecognition;
  if (!Type)
    return {
      ready: false,
      message: 'Dictation is not available in this browser. Recording audio still works.',
    };
  try {
    const instance = new Type();
    if (!('processLocally' in instance) || !Type.available)
      return {
        ready: false,
        message:
          'On-device dictation is unavailable. Record audio, or choose the browser speech service.',
      };
    const state = await Type.available({ langs: [languageCode(language)], processLocally: true });
    return {
      ready: state === 'available',
      downloadable: ['downloadable', 'downloading'].includes(state),
      message:
        state === 'available'
          ? 'On-device dictation is ready.'
          : state === 'unavailable'
            ? 'No on-device dictation pack supports this language. Recording audio remains available.'
            : 'Download the language pack before starting on-device dictation.',
    };
  } catch (error) {
    return {
      ready: false,
      message: languageFailure(
        error,
        'This spoken language is not supported for on-device dictation on this device. Record audio or choose another language/browser speech service.',
      ).message,
    };
  }
}
export function insertTranscript(field, text) {
  const start = field.selectionStart ?? field.value.length,
    end = field.selectionEnd ?? start;
  const before = field.value.slice(0, start),
    after = field.value.slice(end);
  const chunk =
    (before && !/\s$/.test(before) ? ' ' : '') +
    text.trim() +
    (after && !/^\s/.test(after) ? ' ' : '');
  field.setRangeText(chunk, start, end, 'end');
  const EventType = field.ownerDocument?.defaultView?.Event || Event;
  field.dispatchEvent(new EventType('input', { bubbles: true }));
  return field.value;
}
export function createDictation({ field, onState = () => {}, env = globalThis }) {
  const Type = env.SpeechRecognition || env.webkitSpeechRecognition;
  let recognition,
    ending,
    finishEnd,
    active = false,
    stopping = false,
    disposed = false,
    generation = 0,
    lastError = '';
  const state = (status, message) => onState({ status, message, active });
  async function start({ language, mode = 'local', onlineConsent = false }) {
    const version = ++generation;
    lastError = '';
    if (active) throw new Error('Stop the current dictation first.');
    if (!Type)
      throw new Error(
        'Speech recognition is unavailable in this browser. You can still type or paste a note.',
      );
    language = languageCode(language);
    if (mode === 'browser' && !onlineConsent)
      throw new Error('Allow online audio processing before using the browser speech service.');
    const instance = new Type();
    if (mode === 'local') {
      if (!('processLocally' in instance) || typeof Type.available !== 'function')
        throw new Error(
          'On-device speech is unavailable. Choose the browser speech service if you want to allow online processing.',
        );
      let available;
      try {
        available = await Type.available({ langs: [language], processLocally: true });
      } catch (error) {
        throw languageFailure(
          error,
          'This spoken language is not supported for on-device dictation. Record audio, choose another language, or explicitly use the browser speech service.',
        );
      }
      if (available !== 'available')
        throw new Error(
          available === 'unavailable'
            ? 'On-device speech is not available for this language. Choose another language or the browser service.'
            : 'Download the on-device speech language pack first.',
        );
      instance.processLocally = true;
    }
    if (disposed || version !== generation) return;
    recognition = instance;
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    stopping = false;
    const finalized = new Set();
    ending = new Promise((resolve) => {
      finishEnd = resolve;
    });
    recognition.onstart = () => {
      active = true;
      state('listening', 'Listening… Speak naturally.');
    };
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          if (!finalized.has(i)) {
            finalized.add(i);
            insertTranscript(field, result[0].transcript);
          }
        } else interim += result[0].transcript;
      }
      state('listening', interim || 'Listening…');
    };
    recognition.onerror = (event) => {
      const messages = {
        'not-allowed': 'Microphone or speech access was denied. Allow it in Chrome and try again.',
        'service-not-allowed':
          'Chrome’s speech service is unavailable for this extension or device.',
        'audio-capture': 'No microphone is available. Check your audio input.',
        network:
          'The browser speech service could not connect. Check your connection or try on-device mode.',
        'no-speech': 'No speech was detected. Start again when ready.',
        'language-not-supported': 'This speech language is not supported on this device.',
      };
      lastError = messages[event.error] || 'Speech recognition stopped: ' + event.error;
      state('error', lastError);
    };
    recognition.onend = () => {
      active = false;
      finishEnd?.();
      if (lastError) state('error', lastError);
      else if (stopping) state('idle', 'Dictation stopped. Review the note before saving.');
      else state('idle', 'Dictation ended. Click Start to continue.');
    };
    active = true;
    state('starting', 'Requesting microphone access…');
    try {
      recognition.start();
    } catch (error) {
      active = false;
      finishEnd?.();
      state('error', error.message);
      throw error;
    }
  }
  async function stop() {
    if (!recognition || !active) return;
    stopping = true;
    recognition.stop();
    await Promise.race([ending, new Promise((resolve) => setTimeout(resolve, 1800))]);
    if (active) {
      recognition.abort();
      active = false;
    }
    state('idle', 'Dictation stopped. Review the note before saving.');
  }
  function dispose() {
    disposed = true;
    generation++;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.abort();
    }
    active = false;
    finishEnd?.();
  }
  async function install(language) {
    if (typeof Type?.install !== 'function')
      throw new Error('Speech language downloads are unavailable in this browser.');
    const availability = await speechAvailability(language, env);
    if (availability.ready) return true;
    if (!availability.downloadable) throw new Error(availability.message);
    let installed;
    try {
      installed = await Type.install({ langs: [languageCode(language)], processLocally: true });
    } catch (error) {
      throw languageFailure(
        error,
        'Chrome cannot install a dictation pack for this language. Record audio or choose another spoken language.',
      );
    }
    if (!installed)
      throw new Error(
        'The language pack could not be installed. Try another language or browser service.',
      );
    return installed;
  }
  return {
    start,
    stop,
    dispose,
    install,
    get active() {
      return active;
    },
  };
}
