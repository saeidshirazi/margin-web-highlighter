import { extension } from './platform.js';
import { MAX_PROOFREAD_LENGTH } from './proofreading-limit.js';

export function addProofreading(field, editor) {
  const panel = document.createElement('details');
  panel.className = 'proofreading';
  panel.innerHTML =
    '<summary>Proofread note · English</summary><p class="muted small">Checks the draft on this device. Choose which suggestions to apply.</p><p class="muted small" data-proofread-status role="status"></p><ul data-proofread-issues></ul>';
  (field.closest('label') || field).after(panel);
  const status = panel.querySelector('[data-proofread-status]');
  const list = panel.querySelector('[data-proofread-issues]');
  const ignored = new Set();
  let worker,
    timer,
    pending,
    composing = false;

  function dispose() {
    clearTimeout(timer);
    worker?.terminate();
    worker = undefined;
    pending = undefined;
  }
  function render(issues, draft) {
    const visible = issues.filter((issue) => !ignored.has(key(issue)));
    list.replaceChildren();
    status.textContent = visible.length
      ? `${visible.length} ${visible.length === 1 ? 'suggestion' : 'suggestions'}${visible.length > 8 ? ' · showing the first 8' : ''}`
      : 'No English suggestions for this draft.';
    for (const issue of visible.slice(0, 8)) {
      const row = document.createElement('li');
      const show = button(issue.message, () => {
        if (field.value !== draft) return;
        field.focus();
        field.setSelectionRange(issue.start, issue.end);
      });
      row.append(show);
      const controls = document.createElement('div');
      controls.className = 'row wrap';
      for (const replacement of new Set(issue.replacements)) {
        const apply = button(replacement ? `Apply “${replacement}”` : 'Remove this text', () => {
          if (field.value !== draft || !panel.open) return;
          field.focus();
          field.setRangeText(replacement, issue.start, issue.end, 'end');
          field.dispatchEvent(new Event('input', { bubbles: true }));
        });
        controls.append(apply);
      }
      controls.append(
        button('Ignore', () => {
          ignored.add(key(issue));
          render(issues, draft);
          (list.querySelector('button') || panel.querySelector('summary')).focus();
        }),
      );
      row.append(controls);
      list.append(row);
    }
  }
  function fail() {
    dispose();
    status.textContent = 'Proofreading could not finish. Close and reopen this panel to retry.';
  }
  function check() {
    if (!panel.open || !panel.isConnected || composing || pending !== undefined) return;
    const draft = field.value;
    if (!draft.trim()) return;
    if (draft.length > MAX_PROOFREAD_LENGTH) {
      status.textContent = 'Proofreading supports drafts up to 16,000 characters.';
      return;
    }
    try {
      if (!worker) {
        worker = new Worker(extension.runtime.getURL('proofreading-worker.js'), { type: 'module' });
        worker.onerror = fail;
        worker.onmessage = ({ data }) => {
          const checked = pending;
          pending = undefined;
          if (data.error) return fail();
          if (!panel.open || composing || !panel.isConnected) return;
          if (checked === field.value) render(data.issues, checked);
          else schedule();
        };
      }
      status.textContent = 'Checking English grammar…';
      pending = draft;
      worker.postMessage(draft);
    } catch {
      fail();
    }
  }
  function schedule() {
    clearTimeout(timer);
    list.replaceChildren();
    status.textContent = '';
    if (panel.open && !composing) timer = setTimeout(check, 400);
  }
  panel.ontoggle = () => {
    if (!panel.open) dispose();
    schedule();
  };
  field.addEventListener('input', schedule);
  field.addEventListener('compositionstart', () => {
    composing = true;
    schedule();
  });
  field.addEventListener('compositionend', () => {
    composing = false;
    schedule();
  });
  if (editor.tagName === 'DIALOG') editor.addEventListener('close', dispose, { once: true });
  else window.addEventListener('pagehide', dispose, { once: true });
}

function key(issue) {
  return JSON.stringify([issue.start, issue.original, issue.message]);
}

function button(label, click) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.onclick = click;
  return element;
}
