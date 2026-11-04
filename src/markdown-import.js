import { marked } from 'marked';
export async function prepareMarkdown(text, name = 'Untitled.md') {
  if (!text.trim()) throw new Error('The Markdown document is empty.');
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024)
    throw new Error('Keep each Markdown document under 5 MB.');
  if (text.includes('\u0000')) throw new Error('This file does not look like a text document.');
  const heading = marked.lexer(text).find((token) => token.type === 'heading' && token.depth === 1);
  const title = heading?.text || name.replace(/\.(md|markdown|txt)$/i, '') || 'Untitled document';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hash = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { url: 'local://markdown/' + hash, type: 'note', title, note: text, text, article: '' };
}
