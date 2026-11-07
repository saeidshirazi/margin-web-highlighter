import { languageName, speechLocale } from './languages.js';
import { extension } from './platform.js';

function locale(tag) {
  try {
    const parsed = new Intl.Locale(tag);
    if (parsed.language !== 'und') return parsed;
  } catch {}
}

async function identify(text) {
  try {
    const result = await extension.i18n.detectLanguage(text);
    const best = result.languages[0];
    if (result.isReliable && best?.percentage >= 50) return locale(best.language);
  } catch {}
}

const accentLabels = { 'en-US': 'American English (US)', 'en-GB': 'British English (UK)' };

export function addSelectionSpeech(toolbar, trigger, options) {
  const { text, context, sourceLanguage, preferredVoice, reposition } = options;
  const doc = toolbar.ownerDocument;
  const win = doc.defaultView;
  const synth = win.speechSynthesis;
  const panel = doc.createElement('div');
  panel.className = 'selection-speech';
  panel.id = 'margin-selection-speech';
  panel.hidden = true;
  panel.innerHTML = `<p class="muted" data-pronunciation-language></p><label>Pronunciation voice <select></select></label><div class="row"><button type="button" data-repeat-speech disabled>Repeat</button><button type="button" data-stop-speech disabled>Stop</button></div><p class="muted" role="status"></p>`;
  toolbar.append(panel);
  trigger.setAttribute('aria-controls', panel.id);
  trigger.setAttribute('aria-expanded', 'false');
  const select = panel.querySelector('select');
  const languageLabel = panel.querySelector('[data-pronunciation-language]');
  const status = panel.querySelector('[role=status]');
  const stop = panel.querySelector('[data-stop-speech]');
  const repeat = panel.querySelector('[data-repeat-speech]');
  const preferred = locale(preferredVoice) || locale('en-US');
  const declared = locale(sourceLanguage);
  let desired = preferred;
  let voices = [];
  let utterance, playbackTimer, closed;
  const clearPlayback = () => {
    win.clearInterval(playbackTimer);
    utterance = undefined;
    stop.disabled = true;
  };
  const cancel = () => {
    const wasPlaying = !!utterance;
    clearPlayback();
    if (wasPlaying) synth.cancel();
  };
  const loadVoices = () => {
    const previous = select.value;
    voices = synth?.getVoices().filter((voice) => voice.localService) || [];
    select.replaceChildren(
      new Option('Choose a local voice', ''),
      ...voices.map((voice) => {
        const lang = locale(voice.lang)?.baseName;
        return new Option(`${accentLabels[lang] || voice.lang} · ${voice.name}`, voice.voiceURI);
      }),
    );
    const voice =
      voices.find((entry) => entry.voiceURI === previous) ||
      voices.find((entry) => locale(entry.lang)?.baseName === desired.baseName) ||
      voices.find((entry) => locale(entry.lang)?.language === desired.language);
    select.value = voice?.voiceURI || '';
    repeat.disabled = !voice || text.length > 220;
    if (!utterance) {
      status.textContent = voices.length
        ? voice
          ? ''
          : 'No installed voice matches this language. You can choose another voice.'
        : 'No on-device voice is available. Install a system voice to hear pronunciation.';
    }
  };
  function speak() {
    cancel();
    const voice = voices.find((entry) => entry.voiceURI === select.value);
    if (!voice) return;
    if (text.length > 220) {
      status.textContent = 'Select up to 220 characters for pronunciation.';
      return;
    }
    const playback = new win.SpeechSynthesisUtterance(text);
    utterance = playback;
    playback.voice = voice;
    playback.lang = voice.lang;
    let started = false;
    const queuedAt = win.performance.now();
    const finish = (message) => {
      if (utterance !== playback) return;
      clearPlayback();
      status.textContent = message;
    };
    playback.onstart = () => {
      started = true;
    };
    playback.onend = () => finish('Pronunciation finished.');
    playback.onerror = (event) => finish(`The voice could not play (${event.error}).`);
    stop.disabled = false;
    status.textContent = 'Pronouncing selection…';
    // Some system voices go idle without sending the utterance's end event.
    playbackTimer = win.setInterval(() => {
      if (synth.speaking) {
        started = true;
        return;
      }
      if (synth.pending) return;
      if (started) finish('Pronunciation finished.');
      else if (win.performance.now() - queuedAt >= 2000) finish('Ready to repeat.');
    }, 250);
    try {
      synth.speak(playback);
    } catch {
      finish('The voice could not play.');
    }
  }
  trigger.onclick = async () => {
    if (!panel.hidden) return speak();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.disabled = select.disabled = true;
    languageLabel.textContent = 'Detecting language…';
    reposition();
    const detected = await identify(text.slice(0, 220));
    const language = detected || declared || (context.trim() !== text && (await identify(context)));
    if (closed) return;
    if (language) {
      desired = language.region
        ? language
        : declared?.language === language.language && declared.region
          ? declared
          : preferred.language === language.language
            ? preferred
            : locale(speechLocale(language.baseName)) || language;
      languageLabel.textContent = `${detected || !declared ? 'Detected' : 'Page language'} · ${languageName(language.language)}`;
    } else languageLabel.textContent = 'Language unclear. Using your voice preference.';
    trigger.disabled = select.disabled = false;
    loadVoices();
    synth?.addEventListener('voiceschanged', loadVoices);
    reposition();
    speak();
  };
  select.onchange = () => {
    repeat.disabled = !select.value || text.length > 220;
    speak();
  };
  repeat.onclick = speak;
  stop.onclick = () => {
    cancel();
    status.textContent = 'Stopped.';
  };
  return () => {
    closed = true;
    cancel();
    synth?.removeEventListener('voiceschanged', loadVoices);
  };
}
