import { audioNotes } from './db.js';
import { fromBase64, toBase64 } from './pdf-store.js';
import { isAudioType } from './core.js';
import { download, api } from './api.js';
export async function persistRecording(
  { blob, name = 'Voice note', duration = 0 },
  { pageId, highlightId = '' },
) {
  if (!isAudioType(blob.type))
    throw new Error('Choose an audio file such as WebM, MP3, WAV, OGG or M4A.');
  if (blob.size > 20 * 1024 * 1024) throw new Error('Keep audio files under 20 MB.');
  const item = {
    id: 'audio:' + crypto.randomUUID(),
    pageId,
    highlightId,
    type: blob.type,
    base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
    name: String(name),
    duration,
    createdAt: Date.now(),
  };
  await api('save-audio', item);
  return item;
}
export async function renderAudioNotes(container, target) {
  const items = (await audioNotes(target.pageId)).filter(
    (item) => !target.highlightId || item.highlightId === target.highlightId,
  );
  if (!container.isConnected) return () => {};
  const urls = [];
  container.replaceChildren();
  for (const item of items) {
    const div = document.createElement('div');
    div.className = 'audio-note';
    const title = document.createElement('strong');
    title.textContent = item.name || 'Voice note';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    const blob = new Blob([fromBase64(item.base64)], { type: item.type });
    audio.src = URL.createObjectURL(blob);
    urls.push(audio.src);
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = 'Download audio';
    exportButton.onclick = () =>
      download(
        (item.name || 'Voice note').replace(/[<>:"/\\|?*]/g, '') +
          '.' +
          (item.type.includes('mp4')
            ? 'm4a'
            : item.type.includes('mpeg')
              ? 'mp3'
              : item.type.includes('wav')
                ? 'wav'
                : item.type.includes('ogg')
                  ? 'ogg'
                  : 'webm'),
        blob,
      );
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete audio';
    remove.onclick = async () => {
      await api('delete-audio', { id: item.id });
      audio.pause();
      URL.revokeObjectURL(audio.src);
      div.remove();
    };
    div.append(title, audio, exportButton, remove);
    container.append(div);
  }
  return () => {
    container.querySelectorAll('audio').forEach((audio) => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    });
    urls.forEach((url) => URL.revokeObjectURL(url));
  };
}
