import { api } from './api.js';
import { LANGUAGES, speechLocale, languageCode } from './languages.js';
import { createDictation, speechAvailability } from './speech.js';
import { escapeHtml as esc } from './core.js';
import { createAudioRecorder } from './audio.js';
import { persistRecording } from './audio-notes.js';

export function enhanceNotes(modal) {
  const fields = modal.querySelectorAll('textarea[name=note]');
  for (const field of fields) {
    if (field.dataset.assisted) return;
    field.dataset.assisted = 'true';
    field.dir = 'auto';
    const tools = document.createElement('details');
    tools.className = 'note-assist';
    tools.innerHTML = `<summary>Voice & translation tools</summary><div class="speech-controls"><label class="field">Spoken language<input data-speech-language list="speech-languages" value="en-US" aria-label="Spoken language"></label><datalist id="speech-languages">${LANGUAGES.map(([code, name]) => `<option value="${speechLocale(code)}">${esc(name)}</option>`).join('')}</datalist><label class="field">Speech processing<select data-speech-mode><option value="local">On-device</option><option value="browser">Browser speech service · may be online</option></select></label><label data-speech-consent class="cloud-consent" hidden><input type="checkbox"> Allow the browser’s speech service to process my audio online. Margin does not store audio.</label><div class="row wrap"><button type="button" data-speech-start>● Start dictation</button><button type="button" data-speech-stop disabled>Stop</button><button type="button" data-speech-install>Download local language pack</button></div><p data-speech-status class="speech-status" role="status" aria-live="polite">Final words are inserted at your cursor. Live words appear here until confirmed.</p><div class="row wrap"><button type="button" data-note-translate>Translate this note</button><button type="button" data-speech-preference>Save spoken-language default</button></div></div>`;
    field.closest('label')?.after(tools);
    if (!tools.isConnected) field.after(tools);
    const q = (s) => tools.querySelector(s),
      status = q('[data-speech-status]');
    const pending = [],
      previewUrls = [];
    let busySaving = false;
    const audioArea = document.createElement('section');
    audioArea.className = 'recording-tools';
    audioArea.innerHTML =
      '<div class="row wrap"><button type="button" data-audio-record>Record voice</button><button type="button" data-audio-stop disabled>Stop recording</button><label class="audio-import">Attach audio<input type="file" data-audio-file accept="audio/*,.webm,.mp3,.m4a,.ogg,.wav" hidden></label></div><p data-audio-status class="muted small" role="status">Record a voice note or attach an audio file. Audio is saved locally with the note (up to 5 minutes / 20 MB).</p><div data-audio-pending></div>';
    tools.before(audioArea);
    function addPending(value) {
      const id = crypto.randomUUID();
      pending.push({ ...value, id });
      const row = document.createElement('div');
      row.className = 'audio-note';
      row.dataset.pendingId = id;
      const player = document.createElement('audio');
      player.controls = true;
      player.preload = 'metadata';
      player.src = URL.createObjectURL(value.blob);
      previewUrls.push(player.src);
      const name = document.createElement('span');
      name.textContent = value.name;
      const remove = document.createElement('button');
      const download = document.createElement('a');
      download.textContent = 'Download';
      download.href = player.src;
      download.download =
        (value.name || 'Voice note') +
        '.' +
        (value.blob.type.includes('wav')
          ? 'wav'
          : value.blob.type.includes('mpeg')
            ? 'mp3'
            : value.blob.type.includes('mp4')
              ? 'm4a'
              : 'webm');
      remove.type = 'button';
      remove.textContent = 'Discard';
      remove.onclick = () => {
        const index = pending.findIndex((item) => item.id === id);
        if (index >= 0) pending.splice(index, 1);
        player.pause();
        URL.revokeObjectURL(player.src);
        row.remove();
      };
      row.append(name, player, download, remove);
      audioArea.querySelector('[data-audio-pending]').append(row);
    }
    const recorder = createAudioRecorder({
      onComplete: addPending,
      onState: (state, message) => {
        audioArea.querySelector('[data-audio-status]').textContent = message;
        audioArea.dataset.state = state;
        audioArea.querySelector('[data-audio-record]').disabled = [
          'recording',
          'requesting',
        ].includes(state);
        audioArea.querySelector('[data-audio-stop]').disabled = state !== 'recording';
      },
    });
    audioArea.querySelector('[data-audio-record]').onclick = async () => {
      try {
        await speech.stop();
        await recorder.start();
      } catch (e) {
        audioArea.querySelector('[data-audio-status]').textContent = e.message;
        audioArea.querySelector('[data-audio-record]').disabled = false;
      }
    };
    audioArea.querySelector('[data-audio-stop]').onclick = () =>
      recorder.stop().catch((e) => {
        audioArea.querySelector('[data-audio-status]').textContent = e.message;
      });
    audioArea.querySelector('[data-audio-file]').onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) throw new Error('Keep audio files under 20 MB.');
        const mime =
          file.type ||
          {
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            webm: 'audio/webm',
            ogg: 'audio/ogg',
            m4a: 'audio/mp4',
          }[file.name.split('.').pop().toLowerCase()];
        if (!mime?.startsWith('audio/')) throw new Error('Choose an audio file.');
        addPending({
          blob: new Blob([await file.arrayBuffer()], { type: mime }),
          name: file.name,
          duration: 0,
        });
      } catch (error) {
        audioArea.querySelector('[data-audio-status]').textContent = error.message;
      } finally {
        e.target.value = '';
      }
    };
    modal.addEventListener('margin-save-attachments', (e) => {
      if (!pending.length) return;
      e.detail.tasks.push(
        (async () => {
          if (!e.detail.target?.pageId)
            throw new Error(
              'The note was saved, but audio has no page target. Keep this editor open and download your recording.',
            );
          if (busySaving) throw new Error('Audio is already being saved.');
          busySaving = true;
          try {
            for (const value of [...pending]) {
              await persistRecording(value, e.detail.target);
              pending.splice(
                pending.findIndex((item) => item.id === value.id),
                1,
              );
              const row = audioArea.querySelector(`[data-pending-id="${value.id}"]`),
                player = row?.querySelector('audio');
              if (player) {
                player.pause();
                URL.revokeObjectURL(player.src);
              }
              row?.remove();
            }
          } finally {
            busySaving = false;
          }
        })(),
      );
    });
    const cleanup = () => {
      window.removeEventListener('pagehide', cleanup);
      recorder.dispose();
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    modal.addEventListener('close', cleanup, { once: true });
    window.addEventListener('pagehide', cleanup, { once: true });
    const speech = createDictation({
      field,
      onState: (state) => {
        status.textContent = state.message;
        tools.dataset.state = state.status;
        q('[data-speech-start]').disabled = state.active;
        q('[data-speech-stop]').disabled = !state.active;
        q('[data-speech-mode]').disabled = state.active;
        q('[data-speech-language]').disabled = state.active;
      },
    });
    api('preferences')
      .then((settings) => {
        if (tools.isConnected) {
          q('[data-speech-language]').value = settings.voiceLanguage;
          return checkSetup();
        }
      })
      .catch((error) => report(error));
    const report = (e) => {
      status.textContent = e.message;
      tools.dataset.state = 'error';
    };
    let setupVersion = 0;
    const checkSetup = async () => {
      if (speech.active) return;
      const version = ++setupVersion;
      if (!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition)) {
        q('[data-speech-start]').disabled = true;
        q('[data-speech-install]').disabled = true;
        status.textContent =
          'Dictation is not available in this browser. Record or attach audio, or type your note.';
        return;
      }
      if (q('[data-speech-mode]').value === 'browser') {
        q('[data-speech-start]').disabled = false;
        status.textContent =
          'Browser dictation may use an online service. Recording audio is a separate local option.';
        return;
      }
      q('[data-speech-start]').disabled = true;
      const available = await speechAvailability(q('[data-speech-language]').value);
      if (version !== setupVersion || !tools.isConnected || speech.active) return;
      q('[data-speech-start]').disabled = !available.ready;
      q('[data-speech-install]').disabled = !available.downloadable;
      status.textContent = available.message;
    };
    q('[data-speech-mode]').onchange = () => {
      const online = q('[data-speech-mode]').value === 'browser';
      q('[data-speech-consent]').hidden = !online;
      q('[data-speech-install]').hidden = online;
      checkSetup().catch(report);
    };
    q('[data-speech-language]').onchange = () => checkSetup().catch(report);
    checkSetup().catch(report);
    q('[data-speech-start]').onclick = async () => {
      q('[data-speech-start]').disabled = true;
      try {
        if (
          q('[data-speech-mode]').value === 'browser' &&
          !q('[data-speech-consent] input').checked
        )
          throw new Error('Allow online audio processing before using the browser speech service.');
        await recorder.stop();
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        }
        await speech.start({
          language: q('[data-speech-language]').value,
          mode: q('[data-speech-mode]').value,
          onlineConsent: q('[data-speech-consent] input').checked,
        });
      } catch (e) {
        report(e);
        q('[data-speech-start]').disabled = false;
      }
    };
    q('[data-speech-stop]').onclick = () => speech.stop().catch(report);
    q('[data-speech-install]').onclick = async () => {
      const b = q('[data-speech-install]');
      b.disabled = true;
      status.textContent = 'Downloading a local speech pack through your browser…';
      try {
        await speech.install(q('[data-speech-language]').value);
        status.textContent = 'Speech pack ready. Click Start dictation.';
        await checkSetup();
      } catch (e) {
        report(e);
      } finally {
        b.disabled = false;
      }
    };
    q('[data-speech-preference]').onclick = async () => {
      try {
        const voiceLanguage = languageCode(q('[data-speech-language]').value);
        await api('settings', { voiceLanguage });
        status.textContent = 'Spoken-language default saved.';
      } catch (e) {
        report(e);
      }
    };
    q('[data-note-translate]').onclick = async () => {
      try {
        await speech.stop();
        const { openTranslation } = await import('./translation-ui.js');
        await openTranslation({
          text: field.value,
          onSave: (result) => {
            field.value +=
              (field.value ? '\n\n' : '') +
              '### Translation (' +
              result.target +
              ')\n\n' +
              result.text;
            field.dispatchEvent(new Event('input', { bubbles: true }));
          },
        });
      } catch (e) {
        report(e);
      }
    };
    modal.addEventListener('margin-before-submit', (e) => e.detail.tasks.push(speech.stop()));
    modal.addEventListener('margin-before-submit', (e) => e.detail.tasks.push(recorder.stop()));
    modal.addEventListener('close', () => speech.dispose(), { once: true });
    modal.addEventListener('cancel', () => speech.dispose(), { once: true });
  }
}
