import { put, deleteSetting } from './db.js';
import { api } from './api.js';
export function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
export function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export async function importPDF(buffer, title, url) {
  if (buffer.byteLength > 50 * 1024 * 1024) throw new Error('PDF exceeds the 50 MB limit');
  const bytes = new Uint8Array(buffer);
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-'))
    throw new Error('This file is not a PDF');
  // Stage large attachments in IndexedDB to avoid Chrome's runtime message-size limit.
  const id = 'pending-pdf:' + crypto.randomUUID();
  await put('settings', { id, value: { url, title, base64: toBase64(bytes) } });
  try {
    return await api('commit-pdf', { id });
  } finally {
    await deleteSetting(id);
  }
}
