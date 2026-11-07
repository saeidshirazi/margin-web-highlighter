import { extension } from './platform.js';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, PDFHexString } from 'pdf-lib';
import { api, download } from './api.js';
import { get, readingProgress } from './db.js';
import { trackReading } from './reading-progress.js';
import { fromBase64 } from './pdf-store.js';
import { icon, esc, toast, applyTheme } from './ui.js';
import { createAnnotator } from './annotator.js';
pdfjs.GlobalWorkerOptions.workerSrc = extension.runtime.getURL('pdf.worker.mjs');
const root = document.querySelector('#app');
const params = new URL(location.href).searchParams;
const id = params.get('id');
let pdf, source, page, state;
const controllers = new Map();
let zoom = 1.25;
async function init() {
  state = await api('snapshot');
  page = state.pages.find((p) => p.id === id);
  if (!page) throw new Error('PDF no longer exists in the library');
  const asset = await get('assets', id);
  if (!asset)
    throw new Error('The PDF attachment is missing. Open this PDF again from the library.');
  source = fromBase64(asset.base64);
  applyTheme(state.settings.theme);
  document.title = page.title + ' — Margin PDF';
  root.innerHTML = `<header class="reader-bar pdf-toolbar" data-margin-ui><div class="brand">${icon('logo', 23)}margin <span class="muted small">/ PDF</span></div><span class="small" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(page.title)}</span><label class="small">Page <input id="page-number" type="number" min="1" value="1" aria-label="Go to PDF page"></label><select id="zoom" aria-label="PDF zoom"><option value="0.75">75%</option><option value="1">100%</option><option value="1.25" selected>125%</option><option value="1.5">150%</option><option value="2">200%</option></select><button id="download">${icon('arrow', 15)}Annotated PDF</button><button id="library">${icon('book', 15)}Library</button></header><p id="pdf-status" class="muted small" style="text-align:center;margin:12px 15px" role="status">Select text on a page to highlight. Your PDF stays on this device.</p><main id="pages" class="pdf-pages"></main>`;
  pdf = await pdfjs.getDocument({
    data: source.slice(),
    cMapUrl: extension.runtime.getURL('cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: extension.runtime.getURL('standard_fonts/'),
    wasmUrl: extension.runtime.getURL('wasm/'),
    isEvalSupported: false,
  }).promise;
  root.querySelector('#page-number').max = pdf.numPages;
  const number = root.querySelector('#page-number');
  number.onchange = () => goToPage(Number(number.value));
  root.querySelector('#library').onclick = () => api('open-library', { id });
  root.querySelector('#download').onclick = () => exportPDF().catch((e) => toast(e.message));
  root.querySelector('#zoom').onchange = async (e) => {
    const current = currentPage();
    zoom = +e.target.value;
    try {
      if (await renderPages()) goToPage(current);
    } catch (error) {
      toast(error.message);
    }
  };
  await renderPages();
  if (!page.text) indexText().catch((e) => toast('PDF text could not be indexed: ' + e.message));
  const highlight = state.highlights.find(
    (h) => h.id === params.get('highlight') && h.pageId === id,
  );
  const resume = params.has('resume')
    ? (await readingProgress()).entries.find((entry) => entry.id === id)
    : null;
  goToPage(highlight?.anchor.page || Number(params.get('page')) || resume?.position || 1, false);
  trackReading(
    id,
    'pdf',
    () => {
      const current = currentPage();
      if (document.activeElement !== number) number.value = current;
      return current;
    },
    !!resume && !highlight && !Number(params.get('page')),
  );
  extension.storage.onChanged.addListener((c) => {
    if (c.revision)
      for (const controller of controllers.values()) controller.refresh().catch(() => {});
  });
}
function goToPage(position, scrollFirst = true) {
  const number = Math.min(pdf.numPages, Math.max(1, Math.floor(position) || 1));
  root.querySelector('#page-number').value = number;
  if (number > 1 || scrollFirst)
    root.querySelector(`[data-pdf-page="${number}"]`)?.scrollIntoView();
}
function currentPage() {
  const pages = root.querySelector('#pages').children;
  if (
    window.scrollY > 0 &&
    Math.ceil(window.scrollY + innerHeight) >= document.documentElement.scrollHeight
  )
    return pages.length || 1;
  const readingLine = innerHeight / 3;
  let low = 0;
  let high = pages.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (pages[mid].getBoundingClientRect().top <= readingLine) low = mid + 1;
    else high = mid;
  }
  return Math.max(1, low);
}
async function indexText() {
  const chunks = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 500); n++) {
    const p = await pdf.getPage(n),
      text = await p.getTextContent();
    chunks.push(
      text.items
        .map((x) => x.str || '')
        .join(' ')
        .replace(/\s+/gu, ' ')
        .trim(),
    );
  }
  const text = chunks.join('\n\n');
  if (text.trim()) await api('save-page', { url: page.url, text });
}
let observer,
  generation = 0;
async function renderPages() {
  const gen = ++generation;
  observer?.disconnect();
  for (const c of controllers.values()) c.dispose();
  controllers.clear();
  const pages = root.querySelector('#pages');
  pages.replaceChildren();
  observer = new IntersectionObserver(
    (entries, currentObserver) => {
      if (gen !== generation) return;
      for (const entry of entries)
        if (entry.isIntersecting) {
          currentObserver.unobserve(entry.target);
          renderOne(+entry.target.dataset.pdfPage, entry.target, gen).catch((e) => {
            entry.target.textContent = e.message;
          });
        }
    },
    { rootMargin: '900px' },
  );
  for (let n = 1; n <= pdf.numPages; n++) {
    const p = await pdf.getPage(n);
    if (gen !== generation) return;
    const viewport = p.getViewport({ scale: zoom });
    const el = document.createElement('section');
    el.className = 'pdf-page';
    el.dataset.pdfPage = n;
    el.setAttribute('aria-label', 'PDF page ' + n);
    el.style.width = viewport.width + 'px';
    el.style.height = viewport.height + 'px';
    pages.append(el);
    observer.observe(el);
  }
  return true;
}
async function renderOne(n, el, gen) {
  const p = await pdf.getPage(n);
  if (gen !== generation) return;
  const viewport = p.getViewport({ scale: zoom });
  const canvas = document.createElement('canvas');
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = viewport.width * ratio;
  canvas.height = viewport.height * ratio;
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';
  el.append(canvas);
  await p.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
  }).promise;
  if (gen !== generation) return;
  const text = await p.getTextContent();
  if (gen !== generation) return;
  const layer = document.createElement('div');
  layer.className = 'textLayer';
  layer.style.setProperty('--scale-factor', zoom);
  layer.style.setProperty('--total-scale-factor', zoom);
  layer.style.setProperty('--user-unit', p.userUnit || 1);
  el.append(layer);
  await new pdfjs.TextLayer({ textContentSource: text, container: layer, viewport }).render();
  if (gen !== generation) return;
  if (!text.items.some((i) => i.str?.trim()))
    root.querySelector('#pdf-status').textContent =
      'Page ' +
      n +
      ' has no selectable text. Scanned PDFs require an existing text layer (OCR is not included).';
  const controller = createAnnotator({
    root: layer,
    load: async () => {
      const data = await api('page-data', { url: page.url });
      return { ...data, highlights: data.highlights.filter((h) => h.anchor.page === n) };
    },
    create: (input) => api('add-highlight', { ...input, pageId: id }),
    update: (id, patch) => api('update-highlight', { id, patch }),
    remove: (id) => api('delete-highlight', { id }),
    restore: (item) => api('restore-highlight', { item }),
    onLibrary: () => api('open-library', { id }),
    onCapture: (mode, item) => api('open-capture', { pageId: id, highlightId: item?.id, mode }),
    onColor: (color) => api('settings', { color }),
    extraAnchor: (range) => {
      const first = range.startContainer.parentElement?.closest('.pdf-page'),
        last = range.endContainer.parentElement?.closest('.pdf-page');
      if (first !== last) {
        toast('Highlight one PDF page at a time.');
        return false;
      }
      const origin = el.getBoundingClientRect();
      const quads = [...range.getClientRects()]
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => {
          const tl = viewport.convertToPdfPoint(r.left - origin.left, r.top - origin.top),
            tr = viewport.convertToPdfPoint(r.right - origin.left, r.top - origin.top),
            bl = viewport.convertToPdfPoint(r.left - origin.left, r.bottom - origin.top),
            br = viewport.convertToPdfPoint(r.right - origin.left, r.bottom - origin.top);
          return [...tl, ...tr, ...bl, ...br];
        });
      return { page: n, quads };
    },
  });
  controllers.set(n, controller);
}
async function exportPDF() {
  const button = root.querySelector('#download');
  button.disabled = true;
  try {
    const data = await api('page-data', { url: page.url });
    const doc = await PDFDocument.load(source);
    for (const h of data.highlights) {
      const index = h.anchor.page - 1;
      if (
        index < 0 ||
        index >= doc.getPageCount() ||
        !Array.isArray(h.anchor.quads) ||
        !h.anchor.quads.length
      )
        continue;
      const quads = h.anchor.quads.filter(
        (q) => Array.isArray(q) && q.length === 8 && q.every(Number.isFinite),
      );
      if (!quads.length) continue;
      const flat = quads.flat();
      const xs = flat.filter((_, i) => i % 2 === 0),
        ys = flat.filter((_, i) => i % 2 === 1);
      const rgb = [1, 3, 5].map((i) => parseInt(h.color.slice(i, i + 2), 16) / 255);
      const target = doc.getPage(index);
      const annotation = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Highlight',
        Rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        QuadPoints: flat,
        C: rgb,
        CA: 0.4,
        F: 4,
        T: PDFHexString.fromText('Margin'),
        Contents: PDFHexString.fromText(h.note || h.text),
      });
      const ref = doc.context.register(annotation);
      target.node.addAnnot(ref);
    }
    download(
      page.title.replace(/\.pdf$/i, '') + '-annotated.pdf',
      new Blob([await doc.save()], { type: 'application/pdf' }),
    );
    toast('Annotated PDF exported');
  } finally {
    button.disabled = false;
  }
}
init().catch((e) => (root.innerHTML = `<p class="loading">${esc(e.message)}</p>`));
