import { extension } from './platform.js';
import { api, download } from './api.js';
import { toHTML, csv } from './core.js';
import { backupSnapshot } from './db.js';
import { researchMarkdown, researchBundle } from './transfer.js';
import { zipSync, strToU8 } from 'fflate';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
const enc = new TextEncoder(),
  dec = new TextDecoder();
const base64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
};
const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(password, salt) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptBackup(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    format: 'margin-encrypted',
    version: 1,
    salt: base64(salt),
    iv: base64(iv),
    data: base64(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          await key(password, salt),
          enc.encode(JSON.stringify(data)),
        ),
      ),
    ),
  };
}
export async function decryptBackup(data, password) {
  if (data.version !== 1) throw new Error('Unsupported encrypted backup');
  try {
    return JSON.parse(
      dec.decode(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: bytes(data.iv) },
          await key(password, bytes(data.salt)),
          bytes(data.data),
        ),
      ),
    );
  } catch {
    throw new Error('Wrong password or damaged backup');
  }
}
export async function exportData(format, pages, highlights, password = '', options = {}) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    // Capture a conservative counter before the atomic snapshot. Changes while
    // encrypting/downloading remain pending, and large attachments avoid messaging limits.
    const revision = await api('backup-revision');
    const data = await backupSnapshot();
    download(
      `margin-backup-${stamp}${password ? '.encrypted' : ''}.json`,
      JSON.stringify(password ? await encryptBackup(data, password) : data, null, 2),
      'application/json',
    );
    await api('backup-downloaded', { revision }).catch(() => {});
  }
  if (format === 'md')
    download(
      `margin-research-${stamp}.md`,
      researchMarkdown(pages, highlights, options),
      'text/markdown',
    );
  if (format === 'notion' || format === 'agent') {
    const files = researchBundle(pages, highlights, options, format === 'agent');
    download(
      `margin-${format}-${stamp}.zip`,
      new Blob(
        [
          zipSync(
            Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])),
            { level: 6 },
          ),
        ],
        { type: 'application/zip' },
      ),
    );
  }
  if (format === 'notion-copy') {
    const text = researchMarkdown(pages, highlights, options);
    const html = DOMPurify.sanitize(marked.parse(text), {
      FORBID_TAGS: ['img', 'iframe', 'video', 'audio', 'style', 'form'],
    });
    if (typeof ClipboardItem === 'undefined')
      throw new Error('Rich copying is unavailable. Use Copy Markdown or the Notion ZIP instead.');
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
  }
  if (format === 'html')
    download(`margin-research-${stamp}.html`, toHTML(pages, highlights), 'text/html');
  if (format === 'csv')
    download(
      `margin-research-${stamp}.csv`,
      csv([
        ['Title', 'URL', 'Quote', 'Color', 'Note (Markdown)', 'Tags', 'Collection', 'Created'],
        ...pages.flatMap((p) =>
          highlights
            .filter((h) => h.pageId === p.id)
            .map((h) => [
              p.title,
              p.url,
              h.text,
              h.color,
              h.note,
              h.tags.join('; '),
              p.collection,
              new Date(h.createdAt).toISOString(),
            ]),
        ),
      ]),
      'text/csv',
    );
  if (format === 'clipboard')
    await navigator.clipboard.writeText(researchMarkdown(pages, highlights, options));
  if (format === 'print') {
    const page = await extension.tabs.create({ url: extension.runtime.getURL('print.html') });
    await extension.storage.session.set({ ['print-' + page.id]: toHTML(pages, highlights) });
  }
}
