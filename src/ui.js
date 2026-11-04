import { escapeHtml as esc } from './core.js';
import { logoSVG } from './brand.js';
import { enhanceNotes } from './note-tools.js';
export { esc };
const paths = {
  logo: 'M5 3h10l4 4v14H5z M9 9h6 M9 13h6 M9 17h3',
  book: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M13 7a3 3 0 0 1 3-3h4v15h-4a4 4 0 0 0-3 2',
  search: 'm21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  folder: 'M3 6h7l2 3h9v11H3z',
  tag: 'M3 3h8l10 10-8 8L3 11z M7 7h.01',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
  arrow: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
  plus: 'M12 5v14 M5 12h14',
  external: 'M14 3h7v7 M21 3l-11 11 M10 3H3v18h18v-7',
  close: 'M6 6l12 12 M6 18 18 6',
  chevron: 'm9 5 7 7-7 7',
  flash: 'M13 2 3 14h8l-1 8 11-13h-8z',
  file: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',
  trash: 'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  check: 'm5 12 4 4L19 6',
  sun: 'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M6 6l1 1 M17 17l1 1 M6 18l1-1 M17 7l1-1 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M6 10v2a6 6 0 0 0 12 0v-2 M12 18v4 M8 22h8',
  languages: 'M3 5h12 M9 2v3 M6 5c0 6 4 10 9 12 M12 5c0 5-3 9-8 12 M14 21l4-10 4 10 M16 17h4',
};
export const icon = (name, size = 18) =>
  name === 'logo'
    ? logoSVG(size)
    : `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(
        paths[name] || paths.file
      )
        .split(' M')
        .map((p, i) => `<path d="${i ? 'M' : ''}${p}"/>`)
        .join('')}</svg>`;
export function toast(message) {
  let node = document.querySelector('#toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    node.setAttribute('role', 'status');
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 4500);
}
export function dialog({ title, body, submit = 'Save', onSubmit, recordingTarget }) {
  const el = document.createElement('dialog');
  el.className = 'modal';
  el.innerHTML = `<form><div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('close')}</button></div><div class="modal-body">${body}</div><div class="modal-foot"><button type="button" data-close>Cancel</button><button class="primary" type="submit">${esc(submit)}</button></div></form>`;
  document.body.append(el);
  el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => el.close()));
  el.onclose = () => el.remove();
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const b = el.querySelector('[type=submit]');
    b.disabled = true;
    el.setAttribute('aria-busy', 'true');
    el.querySelector('[data-dialog-error]')?.remove();
    try {
      const tasks = [];
      el.dispatchEvent(new CustomEvent('margin-before-submit', { detail: { tasks } }));
      await Promise.all(tasks);
      const saved = await onSubmit(new FormData(e.target), el);
      if (saved !== false) {
        const tasks = [];
        el.dispatchEvent(
          new CustomEvent('margin-save-attachments', {
            detail: {
              tasks,
              target: saved?.pageId
                ? { pageId: saved.pageId, highlightId: saved.highlightId || '' }
                : recordingTarget,
            },
          }),
        );
        await Promise.all(tasks);
        el.close();
      }
    } catch (error) {
      const notice = document.createElement('p');
      notice.dataset.dialogError = 'true';
      notice.className = 'dialog-error';
      notice.setAttribute('role', 'alert');
      notice.textContent = error.message;
      el.querySelector('.modal-body').append(notice);
      notice.scrollIntoView({ block: 'nearest' });
    } finally {
      b.disabled = false;
      el.removeAttribute('aria-busy');
    }
  };
  el.showModal();
  enhanceNotes(el);
  return el;
}
export function confirmAction(title, text, action) {
  return dialog({ title, body: `<p>${esc(text)}</p>`, submit: 'Delete', onSubmit: action });
}
export const field = (label, name, value = '', type = 'text') =>
  `<label class="field">${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}"></label>`;
export function hostname(url) {
  try {
    return new URL(url).hostname || 'Local document';
  } catch {
    return 'Local document';
  }
}
export const date = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
export function applyTheme(theme) {
  document.documentElement.dataset.theme =
    theme === 'auto'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
}
