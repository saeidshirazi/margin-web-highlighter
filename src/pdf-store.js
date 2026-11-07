import { put, deleteSetting } from './db.js';
import { api } from './api.js';
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function downloadPDF(url, fetcher = fetch) {
  const response = await fetcher(url, { credentials: 'omit', signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Could not download PDF: ' + response.status);
  if (!response.body) throw new Error('The server returned an empty PDF download');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    if (Number(response.headers.get('Content-Length')) > MAX_PDF_BYTES)
      throw new Error('PDF exceeds the 50 MB limit');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PDF_BYTES) throw new Error('PDF exceeds the 50 MB limit');
      chunks.push(value);
    }
    return await new Blob(chunks).arrayBuffer();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
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
  if (buffer.byteLength > MAX_PDF_BYTES) throw new Error('PDF exceeds the 50 MB limit');
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
