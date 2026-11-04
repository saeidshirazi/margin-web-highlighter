const SKIP =
  'script,style,noscript,textarea,input,select,button,[contenteditable="true"],[data-margin-ui],.margin-overlay';
export function textIndex(root) {
  const doc = root.ownerDocument || root;
  const walker = doc.createTreeWalker(root, 4, {
    acceptNode(node) {
      return node.parentElement?.closest(SKIP) ? 2 : 1;
    },
  });
  const nodes = [];
  let text = '',
    node;
  while ((node = walker.nextNode())) {
    nodes.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  return { nodes, text };
}
function offsetAt(index, node, offset) {
  if (node.nodeType === 3) {
    const item = index.nodes.find((n) => n.node === node);
    return item ? item.start + offset : null;
  }
  const doc = node.ownerDocument;
  const probe = doc.createRange();
  probe.selectNodeContents(node);
  probe.collapse(true);
  try {
    probe.setStart(node, offset);
    probe.collapse(true);
  } catch {
    return null;
  }
  for (const item of index.nodes) {
    try {
      if (probe.comparePoint(item.node, 0) >= 0) return item.start;
    } catch {}
  }
  return index.text.length;
}
export function captureAnchor(root, range) {
  const index = textIndex(root);
  let start = offsetAt(index, range.startContainer, range.startOffset),
    end = offsetAt(index, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  const exact = index.text.slice(start, end);
  if (!exact.trim()) return null;
  return {
    exact,
    prefix: index.text.slice(Math.max(0, start - 64), start),
    suffix: index.text.slice(end, end + 64),
    start,
    end,
  };
}
export function locateAnchor(root, anchor, index = textIndex(root)) {
  if (!anchor?.exact) return null;
  let start = -1,
    end;
  if (index.text.slice(anchor.start, anchor.end) === anchor.exact) start = anchor.start;
  else {
    let at = index.text.indexOf(anchor.exact),
      best = -Infinity;
    while (at >= 0) {
      let score = 0;
      const before = index.text.slice(Math.max(0, at - 64), at),
        after = index.text.slice(at + anchor.exact.length, at + anchor.exact.length + 64);
      for (let i = 1; i <= Math.min(before.length, anchor.prefix?.length || 0); i++) {
        if (before.at(-i) === anchor.prefix.at(-i)) score++;
        else break;
      }
      for (let i = 0; i < Math.min(after.length, anchor.suffix?.length || 0); i++) {
        if (after[i] === anchor.suffix[i]) score++;
        else break;
      }
      score -= Math.abs(at - (anchor.start || 0)) / Math.max(index.text.length, 1);
      if (score > best) {
        start = at;
        best = score;
      }
      at = index.text.indexOf(anchor.exact, at + 1);
    }
  }
  if (start < 0) {
    // A layout or reader transformation can change whitespace without changing the quote.
    let normalized = '';
    const offsets = [];
    for (let i = 0; i < index.text.length; i++) {
      const char = /\s/u.test(index.text[i]) ? ' ' : index.text[i];
      if (char === ' ' && normalized.endsWith(' ')) continue;
      normalized += char;
      offsets.push(i);
    }
    const quote = anchor.exact.replace(/\s+/gu, ' ').trim();
    let at = normalized.indexOf(quote),
      distance = Infinity;
    while (quote && at >= 0) {
      const raw = offsets[at];
      const delta = Math.abs(raw - (anchor.start || 0));
      if (delta < distance) {
        start = raw;
        end = offsets[at + quote.length - 1] + 1;
        distance = delta;
      }
      at = normalized.indexOf(quote, at + 1);
    }
  }
  if (start < 0) return null;
  end ??= start + anchor.exact.length;
  const first = index.nodes.find((n) => n.end > start),
    last = index.nodes.find((n) => n.end >= end);
  if (!first || !last) return null;
  const range = (root.ownerDocument || root).createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return range;
}
export function paintHighlights(root, highlights, onClick) {
  // CSS Highlights preserves the page's DOM and supports overlapping annotations.
  const doc = root.ownerDocument || root;
  const win = doc.defaultView;
  const ranges = [];
  const index = textIndex(root);
  const sheets = [];
  const missed = [];
  for (const h of highlights) {
    const range = locateAnchor(root, h.anchor, index);
    if (!range) {
      missed.push(h.id);
      continue;
    }
    const name = 'margin-' + h.id.replace(/[^a-zA-Z0-9_-]/g, '');
    if (win.CSS?.highlights && win.Highlight) {
      win.CSS.highlights.set(name, new win.Highlight(range));
      sheets.push(
        `::highlight(${name}){background-color:${/^#[0-9a-f]{6}$/i.test(h.color) ? h.color : '#ffe08a'};color:#191919}`,
      );
    }
    ranges.push({ range, h });
  }
  const style = doc.createElement('style');
  style.dataset.marginUi = 'true';
  doc.head.append(style);
  style.textContent = sheets.join('\n');
  const click = (e) => {
    if (win.getSelection()?.toString()) return;
    const matches = ranges.filter(({ range }) =>
      [...range.getClientRects()].some(
        (r) =>
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom,
      ),
    );
    if (matches.length) onClick?.(matches.at(-1).h, e);
  };
  root.addEventListener('click', click);
  return {
    missed,
    dispose() {
      style.remove();
      root.removeEventListener('click', click);
      for (const { h } of ranges)
        win.CSS?.highlights?.delete('margin-' + h.id.replace(/[^a-zA-Z0-9_-]/g, ''));
    },
  };
}
