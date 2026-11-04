import { captureAnchor, paintHighlights, locateAnchor } from './anchor.js';
import { escapeHtml as esc } from './core.js';
const css = `:host{all:initial;font-family:system-ui,sans-serif;color:#202c28;font-size:13px;line-height:1.5}*{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer;border:1px solid #dce4df;border-radius:8px;background:white;padding:7px 10px;color:#253d33}button:hover{background:#f1f6f3}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #4b9172;outline-offset:2px}.box{position:fixed;z-index:2147483647;background:#fff;border:1px solid #dce4df;border-radius:13px;box-shadow:0 8px 35px #10291e33;padding:9px;max-width:calc(100vw - 20px)}.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.swatch{width:27px;height:27px;padding:0;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #b9c6bc}.swatch[aria-pressed=true]{box-shadow:0 0 0 2px #204c3b}.editor{width:330px}label{display:block;margin-top:10px;font-size:12px;font-weight:600}textarea,input[type=text]{width:100%;padding:8px;border:1px solid #d3ddd6;border-radius:7px;background:#fff;color:#202c28}textarea{height:100px;resize:vertical}input[type=color]{width:29px;height:29px;border:0;padding:0;background:none;cursor:pointer}.muted{color:#69786f;font-size:11px}.toast{bottom:20px;left:20px;max-width:440px}.quick{bottom:20px;right:20px}.danger{color:#a53635}.quote{max-height:80px;overflow:auto;margin:8px 0;padding:8px;background:#f3f7f3;border-radius:6px;white-space:pre-wrap}.tools button{padding:3px 8px;font-size:12px}`;
export function createAnnotator({
  root = document.body,
  load,
  create,
  update,
  remove,
  restore,
  onLibrary,
  onReader,
  onPanel,
  onColor,
  extraAnchor,
  onCapture,
}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const host = doc.createElement('div');
  host.dataset.marginUi = 'true';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;';
  doc.documentElement.append(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = css;
  shadow.append(style);
  const layer = doc.createElement('div');
  shadow.append(layer);
  let data = {
      highlights: [],
      settings: { colors: ['#ffe08a'], color: '#ffe08a', selectionToolbar: true },
    },
    painted,
    pending,
    quick = false,
    box,
    toastTimer,
    lastDeleted,
    refreshTimer;
  const error = (e) => toast(e.message || String(e));
  function toast(text, undo = false) {
    shadow.querySelector('.toast')?.remove();
    const el = doc.createElement('div');
    el.className = 'box toast';
    el.setAttribute('role', 'status');
    el.textContent = text;
    if (undo) {
      const b = doc.createElement('button');
      b.textContent = 'Undo';
      b.onclick = async () => {
        try {
          await restore(lastDeleted);
          el.remove();
          await refresh();
        } catch (e) {
          error(e);
        }
      };
      el.append(' ', b);
    }
    layer.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 6000);
  }
  function close() {
    box?.remove();
    box = null;
  }
  function position(el, x, y) {
    el.style.left =
      Math.max(10, Math.min(x, win.innerWidth - (el.classList.contains('editor') ? 350 : 330))) +
      'px';
    el.style.top =
      Math.max(
        10,
        Math.min(y + 10, win.innerHeight - (el.classList.contains('editor') ? 470 : 90)),
      ) + 'px';
  }
  function palette(parent, selected, action) {
    for (const c of data.settings.colors) {
      const b = doc.createElement('button');
      b.className = 'swatch';
      b.style.background = c;
      b.title = 'Highlight ' + c;
      b.setAttribute('aria-label', 'Highlight ' + c);
      b.setAttribute('aria-pressed', String(c === selected));
      b.onclick = () => action(c);
      parent.append(b);
    }
    const picker = doc.createElement('input');
    picker.type = 'color';
    picker.value = selected;
    picker.title = 'Custom highlight color';
    picker.setAttribute('aria-label', 'Custom highlight color');
    picker.onchange = () => action(picker.value);
    parent.append(picker);
  }
  let generation = 0,
    disposed = false;
  async function refresh() {
    const version = ++generation;
    const next = await load();
    if (disposed || version !== generation) return next;
    data = next;
    painted?.dispose();
    painted = paintHighlights(root, data.highlights, (h, e) => editor(h, e.clientX, e.clientY));
    return data;
  }
  async function highlight(c = data.settings.color, edit = false) {
    if (!pending) return;
    try {
      const item = await create({ ...pending, color: c });
      pending = null;
      close();
      win.getSelection()?.removeAllRanges();
      await refresh();
      if (edit) editor(item, win.innerWidth / 2 - 160, Math.min(160, win.innerHeight / 3));
      else toast('Highlight saved on this device');
    } catch (e) {
      error(e);
    }
  }
  function selection() {
    const sel = win.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    if (
      !root.contains(range.commonAncestorContainer) ||
      range.startContainer.parentElement?.closest(
        'input,textarea,[contenteditable=true],[data-margin-ui]',
      )
    )
      return false;
    const anchor = captureAnchor(root, range);
    if (!anchor) return false;
    const extra = extraAnchor?.(range);
    if (extra === false) return false;
    pending = { text: anchor.exact, anchor: { ...anchor, ...extra } };
    return range;
  }
  function selectionToolbar(range) {
    close();
    const rect = range.getBoundingClientRect();
    box = doc.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'toolbar');
    box.setAttribute('aria-label', 'Highlight selection');
    const row = doc.createElement('div');
    row.className = 'row';
    palette(row, data.settings.color, (c) => highlight(c));
    const note = doc.createElement('button');
    note.textContent = '+ Note';
    note.onclick = () => highlight(data.settings.color, true);
    row.append(note);
    box.append(row);
    box.onmousedown = (e) => {
      if (e.target.type !== 'color') e.preventDefault();
    };
    layer.append(box);
    position(box, rect.left, rect.bottom);
  }
  function editor(item, x, y) {
    close();
    box = doc.createElement('div');
    box.className = 'box editor';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Edit highlight');
    box.innerHTML = `<div class="row"><strong style="flex:1">Your annotation</strong><button data-close aria-label="Close annotation">×</button></div><div class="quote">${esc(item.text)}</div><div class="row" data-palette></div><label>Note <span class="muted">· Markdown supported</span><textarea data-note placeholder="What makes this worth keeping?">${esc(item.note)}</textarea></label><div class="row tools"><button data-format="**">Bold</button><button data-format="*">Italic</button><button data-format="\n- ">List</button><button data-format="&#96;">Code</button></div><label>Tags <span class="muted">· separated by commas</span><input data-tags type="text" value="${esc(item.tags.join(', '))}" placeholder="research, idea"></label><div class="row" style="margin-top:12px"><button data-save>Save note</button><button data-library>Library</button><button data-delete class="danger">Delete</button></div>`;
    let chosen = item.color;
    palette(box.querySelector('[data-palette]'), chosen, async (c) => {
      chosen = c;
      try {
        await update(item.id, { color: c });
        await refresh();
      } catch (e) {
        error(e);
      }
    });
    box.querySelector('[data-close]').onclick = close;
    box.querySelectorAll('[data-format]').forEach(
      (b) =>
        (b.onclick = () => {
          const field = box.querySelector('[data-note]');
          const { selectionStart: a, selectionEnd: z } = field;
          const m = b.dataset.format;
          field.setRangeText(m + field.value.slice(a, z) + (m === '\n- ' ? '' : m), a, z, 'end');
          field.focus();
        }),
    );
    box.querySelector('[data-save]').onclick = async () => {
      const patch = {
        note: box.querySelector('[data-note]').value,
        tags: box.querySelector('[data-tags]').value,
        color: chosen,
      };
      try {
        await update(item.id, patch);
        close();
        await refresh();
        toast('Note saved');
      } catch (e) {
        error(e);
      }
    };
    box.querySelector('[data-library]').onclick = () => onLibrary?.();
    if (onCapture) {
      const voice = doc.createElement('button');
      voice.textContent = 'Voice note';
      voice.onclick = async () => {
        try {
          await update(item.id, {
            note: box.querySelector('[data-note]').value,
            tags: box.querySelector('[data-tags]').value,
          });
          await onCapture('voice', item);
        } catch (e) {
          error(e);
        }
      };
      box.querySelector('[data-library]').after(voice);
    }
    box.querySelector('[data-delete]').onclick = async () => {
      try {
        lastDeleted = await remove(item.id);
        close();
        await refresh();
        toast('Highlight deleted', true);
      } catch (e) {
        error(e);
      }
    };
    layer.append(box);
    position(box, x, y);
  }
  function quickBar() {
    shadow.querySelector('.quick')?.remove();
    if (!quick) return;
    const bar = doc.createElement('div');
    bar.className = 'box quick row';
    const label = doc.createElement('strong');
    label.textContent = 'Quick highlight';
    bar.append(label);
    palette(bar, data.settings.color, async (c) => {
      data.settings.color = c;
      await onColor?.(c);
      quickBar();
    });
    const stop = doc.createElement('button');
    stop.textContent = 'Stop · Esc';
    stop.onclick = () => toggleQuick(false);
    bar.append(stop);
    layer.append(bar);
  }
  function toggleQuick(value = !quick) {
    quick = value;
    close();
    quickBar();
    toast(
      quick
        ? 'Quick highlight on · select text to save · keys 1–5 change color'
        : 'Quick highlight off',
    );
  }
  const mouseup = (e) => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      const range = selection();
      if (!range) return;
      if (quick) highlight();
      else if (data.settings.selectionToolbar) selectionToolbar(range);
    }, 15);
  };
  const keydown = (e) => {
    if (
      e.composedPath().includes(host) ||
      e.target.closest?.('input,textarea,[contenteditable=true]')
    )
      return;
    if (e.key === 'Escape') {
      close();
      if (quick) toggleQuick(false);
    }
    if (quick && /^[1-9]$/.test(e.key)) {
      const c = data.settings.colors[+e.key - 1];
      if (c) {
        data.settings.color = c;
        onColor?.(c);
        quickBar();
      }
    }
  };
  const outside = (e) => {
    if (!e.composedPath().includes(host)) close();
  };
  doc.addEventListener('mouseup', mouseup);
  const keyup = (e) => {
    if (
      e.composedPath().includes(host) ||
      e.target.closest?.('input,textarea,[contenteditable=true]')
    )
      return;
    if (e.key === 'Shift') {
      const range = selection();
      if (range && data.settings.selectionToolbar) selectionToolbar(range);
    }
  };
  doc.addEventListener('keyup', keyup);
  doc.addEventListener('keydown', keydown);
  doc.addEventListener('mousedown', outside);
  win.addEventListener('scroll', close, { passive: true });
  // Re-anchor when client-rendered articles arrive or change, without altering their DOM.
  const observer = new MutationObserver((mutations) => {
    if (
      !mutations.some(
        (m) =>
          !m.target.parentElement?.closest('[data-margin-ui],#margin-highlight-styles') &&
          m.target.id !== 'margin-highlight-styles',
      )
    )
      return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh().catch(error), 600);
  });
  observer.observe(root, { childList: true, characterData: true, subtree: true });
  refresh().catch(error);
  return {
    refresh,
    toast,
    async action(action) {
      if (action === 'highlight') {
        if (selection()) await highlight();
        else toast('Select some page text first');
      }
      if (action === 'quick') toggleQuick();
      if (action === 'library') onLibrary?.();
      if (action === 'reader') onReader?.();
      if (action === 'panel') onPanel?.();
    },
    focus(id) {
      const h = data.highlights.find((h) => h.id === id);
      const range = h && locateAnchor(root, h.anchor);
      if (range) {
        range.startContainer.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          const r = range.getBoundingClientRect();
          editor(h, r.left, r.bottom);
        }, 300);
      } else toast('This quote could not be found. It is still saved in your library.');
    },
    dispose() {
      disposed = true;
      clearTimeout(refreshTimer);
      clearTimeout(toastTimer);
      painted?.dispose();
      observer.disconnect();
      host.remove();
      doc.removeEventListener('mouseup', mouseup);
      doc.removeEventListener('keydown', keydown);
      doc.removeEventListener('keyup', keyup);
      doc.removeEventListener('mousedown', outside);
      win.removeEventListener('scroll', close);
    },
  };
}
