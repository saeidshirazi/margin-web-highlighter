import { dialog } from './ui.js';
export function openReadAloud(text) {
  const synth = globalThis.speechSynthesis;
  let utterance,
    stopped = false,
    chunks = [],
    position = 0;
  const modal = dialog({
    title: 'Read aloud',
    body: '<p class="muted small">Uses voices installed on this device. Online voices are available only if you explicitly allow them.</p><label class="field">Voice<select data-voice></select></label><label class="small"><input type="checkbox" data-remote-voices> Allow online/browser voices</label><label class="field">Speed<input data-speed type="range" min="0.6" max="1.8" step="0.1" value="1"></label><div class="row wrap"><button type="button" data-speak>Read aloud</button><button type="button" data-pause>Pause / resume</button><button type="button" data-stop>Stop</button></div><p data-voice-status role="status" class="muted small"></p>',
    submit: 'Done',
    onSubmit: () => {},
  });
  const q = (s) => modal.querySelector(s);
  const status = (text) => (q('[data-voice-status]').textContent = text);
  const update = () => {
    const select = q('[data-voice]');
    select.replaceChildren();
    const voices =
      synth?.getVoices().filter((v) => v.localService || q('[data-remote-voices]').checked) || [];
    for (const voice of voices) {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent =
        voice.name + ' · ' + voice.lang + (voice.localService ? ' · local' : ' · online');
      select.append(option);
    }
    q('[data-speak]').disabled = !voices.length;
    if (!voices.length)
      status(
        'No matching voice is installed or ready. Install a system voice, or allow browser voices. You can still play recorded audio notes.',
      );
    return voices;
  };
  let voices = update();
  const voicesChanged = () => {
    voices = update();
  };
  synth?.addEventListener('voiceschanged', voicesChanged);
  q('[data-remote-voices]').onchange = voicesChanged;
  const stop = () => {
    stopped = true;
    synth?.cancel();
    status('Stopped.');
  };
  const next = () => {
    if (stopped || position >= chunks.length) {
      if (!stopped) status('Finished reading.');
      return;
    }
    utterance = new SpeechSynthesisUtterance(chunks[position++]);
    utterance.voice = voices.find((v) => v.voiceURI === q('[data-voice]').value);
    utterance.lang = utterance.voice?.lang || 'en';
    utterance.rate = Number(q('[data-speed]').value);
    utterance.onend = next;
    utterance.onerror = (e) => {
      if (!['canceled', 'interrupted'].includes(e.error))
        status('The voice could not play: ' + e.error);
    };
    synth.speak(utterance);
    status('Reading ' + position + ' of ' + chunks.length + ' passages.');
  };
  q('[data-speak]').onclick = () => {
    stop();
    chunks = String(text).match(/[^.!?\n]{1,220}[.!?\n]?/g) || [];
    position = 0;
    stopped = false;
    if (!chunks.length) return status('There is no text to read.');
    next();
  };
  q('[data-stop]').onclick = stop;
  q('[data-pause]').onclick = () => {
    if (synth?.paused) {
      synth.resume();
      status('Reading resumed.');
    } else {
      synth?.pause();
      status('Paused.');
    }
  };
  const cleanup = () => {
    window.removeEventListener('pagehide', cleanup);
    stop();
    synth?.removeEventListener('voiceschanged', voicesChanged);
  };
  modal.addEventListener('close', cleanup, { once: true });
  window.addEventListener('pagehide', cleanup, { once: true });
  return modal;
}
