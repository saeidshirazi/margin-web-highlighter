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
const maxSelectionLength = 220;

export function addSelectionSpeech(toolbar, trigger, options) {
  const { text, context, sourceLanguage, preferredVoice, reposition } = options;
  const doc = toolbar.ownerDocument;
  const win = doc.defaultView;
  const synth = win.speechSynthesis;
  const panel = doc.createElement('div');
  panel.className = 'selection-speech';
  panel.id = 'margin-selection-speech';
  panel.hidden = true;
  panel.innerHTML = `<p class="muted" data-pronunciation-language></p><label>Pronunciation voice <select></select></label><div class="speech-playback"><button type="button" data-speech-action disabled>Repeat</button><p class="muted" role="status"></p></div>`;
  toolbar.append(panel);
  trigger.setAttribute('aria-controls', panel.id);
  trigger.setAttribute('aria-expanded', 'false');
  const select = panel.querySelector('select');
  const languageLabel = panel.querySelector('[data-pronunciation-language]');
  const status = panel.querySelector('[role=status]');
  const action = panel.querySelector('[data-speech-action]');
  const preferred = locale(preferredVoice) || locale('en-US');
  const declared = locale(sourceLanguage);
  let desired = preferred;
  let voiceKey, rememberedVoice;
  let voices = [];
  let utterance, playbackTimer, closed;
  const updateAction = () => {
    action.textContent = utterance ? 'Stop' : 'Repeat';
    action.disabled = !utterance && (!select.value || text.length > maxSelectionLength);
  };
  const clearPlayback = () => {
    win.clearInterval(playbackTimer);
    utterance = undefined;
    updateAction();
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
      voices.find((entry) => entry.voiceURI === rememberedVoice) ||
      voices.find((entry) => entry.voiceURI === previous) ||
      voices.find((entry) => locale(entry.lang)?.baseName === desired.baseName) ||
      voices.find((entry) => locale(entry.lang)?.language === desired.language);
    select.value = voice?.voiceURI || '';
    updateAction();
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
    if (text.length > maxSelectionLength) {
      status.textContent = `Select up to ${maxSelectionLength} characters for pronunciation.`;
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
    updateAction();
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
    const detected = await identify(text.slice(0, maxSelectionLength));
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
    voiceKey = 'pronunciationVoice:' + desired.language;
    try {
      rememberedVoice = (await extension.storage.local.get(voiceKey))[voiceKey];
    } catch {
      // Playback is still available when preferences cannot be read.
    }
    if (closed) return;
    trigger.disabled = select.disabled = false;
    loadVoices();
    synth?.addEventListener('voiceschanged', loadVoices);
    reposition();
    speak();
  };
  select.onchange = () => {
    if (select.value) {
      rememberedVoice = select.value;
      extension.storage.local.set({ [voiceKey]: rememberedVoice }).catch(() => {});
    }
    speak();
  };
  action.onclick = () => {
    if (!utterance) return speak();
    cancel();
    status.textContent = 'Stopped.';
  };
  return () => {
    closed = true;
    cancel();
    synth?.removeEventListener('voiceschanged', loadVoices);
  };
}
