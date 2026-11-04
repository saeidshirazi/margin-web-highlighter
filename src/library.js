import { extension, browserTarget } from './platform.js';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api } from './api.js';
import { searchPages, safeUrl, canonicalUrl } from './core.js';
import { inCollection, collectionPath, collectionTree, presetPages } from './organization.js';
import {
  mountCollections,
  bindSourceDragging,
  moveSourcesDialog,
  createCollectionDialog,
} from './collections-ui.js';
import { setupPresets, addSavedExports } from './presets-ui.js';
import {
  icon,
  esc,
  toast,
  dialog,
  field,
  confirmAction,
  hostname,
  date,
  applyTheme,
} from './ui.js';
import { exportData, decryptBackup } from './backup.js';
import { localAI } from './ai.js';
import { importPDF } from './pdf-store.js';
import { put, deleteSetting } from './db.js';
import { researchMarkdown } from './transfer.js';
import { prepareMarkdown } from './markdown-import.js';
import { openTranslation } from './translation-ui.js';
import { renderAudioNotes } from './audio-notes.js';
import { openReadAloud } from './read-aloud.js';
import { addDriveSettings } from './drive-ui.js';
import { addExperience, addExperienceSettings, revealGuide } from './experience-ui.js';
let releaseDetailAudio = () => {};
let organizationUndo, organizationMessage;
const app = document.querySelector('#app');
let state,
  device,
  view = 'all',
  filters = {},
  selected = new Set(),
  detailId,
  detailsCollapsed = false,
  detailScroll = 0,
  studyRevealed = false;
const markdown = (text) =>
  DOMPurify.sanitize(marked.parse(text || ''), {
    FORBID_TAGS: ['img', 'iframe', 'video', 'audio', 'source', 'style', 'form', 'input'],
    FORBID_ATTR: ['style'],
  });
const action = (name, text, ico = '', cls = '') =>
  `<button type="button" data-action="${name}" class="${cls}">${ico ? icon(ico) : ''}${text}</button>`;
async function refresh() {
  const resizeFocused = document.activeElement?.classList.contains('detail-resizer');
  [state, device] = await Promise.all([api('snapshot'), api('device-experience')]);
  applyTheme(state.settings.theme);
  render();
  if (detailId) renderDetail();
  if (resizeFocused) document.querySelector('.detail-resizer')?.focus();
}
function counts(p) {
  return state.highlights.filter((h) => h.pageId === p.id);
}
function render() {
  detailScroll = document.querySelector('.drawer')?.scrollTop || detailScroll;
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">${icon('logo', 25)}</span><div>margin<small>Ideas worth keeping</small></div></div><div class="nav">${[
    ['all', 'All pages', 'grid', state.pages.length],
    ['bookmarks', 'Bookmarks', 'bookmark', state.pages.filter((p) => p.bookmarked).length],
    ['study', 'Flashcards', 'flash', state.cards.length],
  ]
    .map(
      ([v, t, i, n]) =>
        `<button data-view="${v}" class="${view === v ? 'active' : ''}">${icon(i)}${t}<span class="count">${n}</span></button>`,
    )
    .join(
      '',
    )}</div><div class="nav-label eyebrow">Collections<button class="icon-btn" data-action="collection" aria-label="New collection">${icon('plus', 14)}</button></div><div class="collections nav" data-collection-tree aria-label="Collections"></div><div class="sidebar-foot"><div class="nav"><button data-view="settings" class="${view === 'settings' ? 'active' : ''}">${icon('settings')}Settings & backups</button></div><div class="local-badge"><i class="dot"></i>Local first. Always yours.</div></div></aside><main class="workspace ${detailId && !detailsCollapsed ? 'details-open' : ''}" style="--details-width:${state.settings.detailWidth}px"><header class="topbar"><div class="search">${icon('search')}<input id="search" aria-label="Search library" placeholder="Search highlights, notes, and pages…" value="${esc(filters.query || '')}"></div><span class="key">Ctrl K</span>${action('export', 'Export', 'arrow')}${action('add', 'Add to library', 'plus', 'primary')}</header><div class="content" id="content"></div></main></div>`;
  renderContent();
  const search = app.querySelector('#search');
  search.oninput = () => {
    filters.query = search.value;
    if (view === 'settings' || view === 'study') view = 'all';
    renderContent();
    if (search.value.trim() && !device.searched) {
      device.searched = true;
      api('update-experience', { searched: true }).catch((e) => toast(e.message));
    }
  };
  app.querySelectorAll('[data-view]').forEach(
    (b) =>
      (b.onclick = () => {
        closeDetail();
        view = b.dataset.view;
        filters = {};
        selected.clear();
        history.replaceState(null, '', view === 'settings' ? '#settings' : '#' + view);
        render();
      }),
  );
  bindActions(app);
  mountCollections(app.querySelector('[data-collection-tree]'), state, filters, {
    choose: (path) => {
      closeDetail();
      view = 'all';
      filters = path === null ? { unfiled: true } : { collection: path };
      history.replaceState(
        null,
        '',
        path === null ? '#unfiled' : '#collection=' + encodeURIComponent(path),
      );
      selected.clear();
      render();
    },
    changed: organizationChanged,
  });
}
function renderContent() {
  const content = app.querySelector('#content');
  if (view === 'settings') return renderSettings(content);
  if (view === 'study') return renderStudy(content);
  const pages = searchPages(state.pages, state.highlights, {
    ...filters,
    bookmarked: view === 'bookmarks',
  });
  const tags = [
    ...new Set([...state.pages.flatMap((p) => p.tags), ...state.highlights.flatMap((h) => h.tags)]),
  ].sort();
  content.innerHTML = `<div class="page-heading"><span class="eyebrow">Your personal reading space</span><h1>${esc(filters.collection || (filters.unfiled ? 'Unfiled sources' : view === 'bookmarks' ? 'Saved for later' : 'Keep what stays with you.'))}</h1><p class="heading-description">${filters.collection ? 'Includes sources in this collection and its subcollections.' : filters.unfiled ? 'Sources without collection labels. Your notes and highlights are kept.' : 'Your highlights, notes, and sources. Connected by curiosity. Kept on your device.'}</p><div class="library-metrics"><div><span>${icon('book', 19)}</span><strong>${state.pages.length}</strong><small>Saved documents</small></div><div><span>${icon('tag', 19)}</span><strong>${state.highlights.length}</strong><small>Highlights collected</small></div><div><span>${icon('folder', 19)}</span><strong>${collectionTree(state.pages).length}</strong><small>Collections</small></div><div><span>${icon('flash', 19)}</span><strong>${state.cards.filter((c) => c.dueAt <= Date.now()).length}</strong><small>Cards to review</small></div></div></div><section class="transfer-strip"><div><span class="eyebrow">From reading to doing</span><strong>Take your ideas to the next step.</strong></div><div class="row wrap">${action('export-notion', 'Notion', 'external')}${action('export-markdown', 'Markdown', 'file')}${action('export-agent', 'For AI agents', 'flash')}${action('import-markdown', 'Import .md', 'plus', 'ghost')}${action('voice-note', 'Voice note', 'mic')}</div></section><div class="toolbar"><select id="type-filter" aria-label="Filter by document type"><option value="">All types</option>${[
    ['web', 'Web pages'],
    ['pdf', 'PDF documents'],
    ['youtube', 'YouTube'],
    ['note', 'Notes'],
  ]
    .map(([v, t]) => `<option value="${v}" ${filters.type === v ? 'selected' : ''}>${t}</option>`)
    .join(
      '',
    )}</select><select id="tag-filter" aria-label="Filter by tag"><option value="">All tags</option>${tags.map((t) => `<option ${filters.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><div class="color-filter" aria-label="Filter by color">${[...new Set([...state.settings.colors, ...state.highlights.map((h) => h.color)])].map((c) => `<button class="swatch ${filters.color === c ? 'active' : ''}" data-color="${c}" style="background:${c}" aria-label="Filter ${c}" title="Filter ${c}"></button>`).join('')}</div><div class="spacer"></div>${Object.values(filters).some(Boolean) ? action('clear', 'Clear filters', '', 'ghost') : ''}<select id="sort" aria-label="Sort pages">${[
    ['newest', 'Recently updated'],
    ['oldest', 'Oldest first'],
    ['title', 'Title A–Z'],
  ]
    .map(([v, t]) => `<option value="${v}" ${filters.sort === v ? 'selected' : ''}>${t}</option>`)
    .join(
      '',
    )}</select></div>${selected.size ? `<div class="hint row" style="margin:0 0 20px"><strong>${selected.size} selected</strong>${action('move', 'Move to collection', 'folder')}${action('export', 'Export selected', 'arrow')}${action('delete-selected', 'Delete', 'trash', 'danger')}</div>` : ''}<div class="view-controls" aria-label="Library layout"><button data-layout="grid" aria-label="Grid view" aria-pressed="${state.settings.libraryLayout !== 'list'}">${icon('grid', 16)}</button><button data-layout="list" aria-label="List view" aria-pressed="${state.settings.libraryLayout === 'list'}">${icon('book', 16)}</button><span class="muted small">${pages.length} shown</span></div><div class="grid ${state.settings.libraryLayout === 'list' ? 'is-list' : ''}">${pages.map(card).join('')}</div>${pages.length ? '' : `<div class="empty"><div class="illustration">${icon('book', 34)}</div><h2>${state.pages.length ? 'No pages match these filters' : 'Your next great idea starts here.'}</h2><p>${state.pages.length ? 'Try another search, tag, or color. Your saved pages are still here.' : 'Select text on any website and choose a color. Your highlights, notes, and pages will be waiting right here.'}</p><div class="row">${action(state.pages.length ? 'clear' : 'guide', state.pages.length ? 'Clear filters' : 'How to highlight', 'book', 'primary')}${action('pdf', 'Open a PDF', 'file')}</div></div>`}<div class="hint">${icon('bookmark', 19)}<span><strong>A small habit, a growing library.</strong> Select a passage, choose a color, and make it yours. <span class="key">Alt S</span> highlights instantly.</span></div>`;
  content.querySelector('#type-filter').onchange = (e) => {
    filters.type = e.target.value;
    renderContent();
  };
  content.querySelector('#tag-filter').onchange = (e) => {
    filters.tag = e.target.value;
    renderContent();
  };
  content.querySelector('#sort').onchange = (e) => {
    filters.sort = e.target.value;
    renderContent();
  };
  content.querySelectorAll('[data-color]').forEach(
    (b) =>
      (b.onclick = () => {
        filters.color = filters.color === b.dataset.color ? '' : b.dataset.color;
        renderContent();
      }),
  );
  content.querySelectorAll('[data-page]').forEach((b) => {
    b.onclick = () => openDetail(b.dataset.page);
    b.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail(b.dataset.page);
      }
    };
  });
  content.querySelectorAll('[data-select]').forEach(
    (b) =>
      (b.onchange = () => {
        b.checked ? selected.add(b.dataset.select) : selected.delete(b.dataset.select);
        const id = b.dataset.select;
        renderContent();
        [...content.querySelectorAll('[data-select]')]
          .find((item) => item.dataset.select === id)
          ?.focus();
      }),
  );
  content.querySelectorAll('[data-layout]').forEach(
    (b) =>
      (b.onclick = async () => {
        state.settings.libraryLayout = b.dataset.layout;
        await api('settings', { libraryLayout: b.dataset.layout });
        renderContent();
      }),
  );
  addExperience(content, state, device, {
    backup: () => exportDialog(exportSelection(), 'json'),
    refresh,
  });
  bindSourceDragging(content, selected);
  addSavedExports(content, state, exportSelection(), runPreset);
  if (organizationUndo) {
    const notice = document.createElement('section');
    notice.className = 'organization-notice';
    notice.setAttribute('aria-label', 'Organization change');
    notice.innerHTML = `<span>${esc(organizationMessage)}</span><button type="button" data-organization-undo>Undo last organization change</button>`;
    notice.querySelector('button').onclick = async () => {
      try {
        await api('undo-organization', organizationUndo);
        organizationUndo = null;
        organizationMessage = '';
        filters = {};
        closeDetail();
        await refresh();
        toast('Organization change undone. Other edits were kept.');
      } catch (error) {
        toast(error.message);
      }
    };
    content.prepend(notice);
  }
  bindActions(content);
}
async function organizationChanged(result, label, route) {
  if (result.count) {
    organizationUndo = result.undo;
    organizationMessage = `${label}: ${result.count} sources. Highlights, notes, cards and audio kept.`;
  }
  if (route?.from && filters.collection && inCollection(filters.collection, route.from))
    filters = route.remove
      ? { unfiled: true }
      : {
          ...filters,
          collection: route.to + collectionPath(filters.collection).slice(route.from.length),
        };
  selected.clear();
  closeDetail();
  if (filters.collection)
    history.replaceState(null, '', '#collection=' + encodeURIComponent(filters.collection));
  else if (filters.unfiled) history.replaceState(null, '', '#unfiled');
  await refresh();
  if (!result.count) toast('These sources are already in that collection.');
}
async function runPreset(preset) {
  const pages = presetPages(preset, state, exportSelection());
  if (!pages.length)
    throw new Error(
      'No sources match this preset. Choose another collection or view; nothing was exported.',
    );
  await exportData(preset.format, pages, state.highlights, '', {
    metadata: preset.metadata,
    includeSource: preset.includeSource,
  });
  toast(`Exported ${pages.length} sources with preset ${preset.name}.`);
}
function card(p) {
  const hs = counts(p);
  const first = hs[0];
  return `<article class="page-card ${selected.has(p.id) ? 'is-selected' : ''}"><input type="checkbox" class="card-select" data-select="${p.id}" aria-label="Select ${esc(p.title)}" ${selected.has(p.id) ? 'checked' : ''}><div class="card-body" aria-expanded="${detailId === p.id && !detailsCollapsed}" data-page="${p.id}" tabindex="0" role="button" aria-label="Open ${esc(p.title)}"><div class="site-line"><span class="site-icon">${icon(p.type === 'pdf' ? 'file' : p.type === 'note' ? 'book' : 'external', 13)}</span>${esc(hostname(p.url)).toUpperCase().slice(0, 35)}</div><h3>${esc(p.title)}</h3><div class="quote-preview">${first ? `<mark style="background:${first.color}">${esc(first.text.slice(0, 190))}${first.text.length > 190 ? '…' : ''}</mark>` : esc((p.note || p.text || 'A page worth coming back to.').slice(0, 170))}</div><div class="tags">${[
    ...new Set([...p.tags, ...hs.flatMap((h) => h.tags)]),
  ]
    .slice(0, 3)
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join(
      '',
    )}${p.collection ? `<span class="tag">${icon('folder', 10)} ${esc(p.collection)}</span>` : ''}</div></div><div class="card-footer"><span class="row" style="gap:7px"><span class="dots">${[
    ...new Set(hs.map((h) => h.color)),
  ]
    .slice(0, 5)
    .map((c) => `<i style="background:${c}"></i>`)
    .join(
      '',
    )}</span>${hs.length} highlight${hs.length === 1 ? '' : 's'}</span><span class="card-date">${date(p.updatedAt)}</span></div></article>`;
}
function openDetail(id) {
  if (detailId === id) {
    toggleDetails();
    return;
  }
  detailsCollapsed = false;
  detailScroll = 0;
  detailId = id;
  history.replaceState(null, '', '#page=' + id);
  renderDetail();
  if (matchMedia('(max-width:1100px)').matches)
    document.querySelector('.drawer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeDetail() {
  releaseDetailAudio();
  detailId = null;
  document
    .querySelectorAll('[data-page]')
    .forEach((node) => node.setAttribute('aria-expanded', 'false'));
  document.querySelector('.drawer')?.remove();
  document.querySelector('.workspace')?.classList.remove('details-open');
  document.querySelector('[data-details-toggle]')?.remove();
  detailsCollapsed = false;
  detailScroll = 0;
  history.replaceState(
    null,
    '',
    filters.collection
      ? '#collection=' + encodeURIComponent(filters.collection)
      : filters.unfiled
        ? '#unfiled'
        : '#' + view,
  );
}
function renderDetail() {
  releaseDetailAudio();
  detailScroll = document.querySelector('.drawer')?.scrollTop || detailScroll;
  document.querySelector('.drawer')?.remove();
  const p = state.pages.find((p) => p.id === detailId);
  if (!p) {
    closeDetail();
    return;
  }
  const hs = counts(p);
  const drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.setAttribute('aria-label', 'Page details');
  drawer.innerHTML = `<div class="detail-resizer" role="separator" tabindex="0" aria-label="Resize source details" aria-orientation="vertical" aria-valuemin="360" aria-valuemax="720" aria-valuenow="${state.settings.detailWidth}"></div><div class="drawer-header row between"><span class="eyebrow">${esc(p.type)} · ${hs.length} highlight${hs.length === 1 ? '' : 's'}</span><div class="row"><button class="icon-btn" data-collapse aria-label="Collapse details" title="Hide highlights and show the full library">${icon('chevron')}</button><button class="icon-btn" data-close aria-label="Close details">${icon('close')}</button></div></div><div class="drawer-content"><span class="eyebrow">${esc(hostname(p.url))}</span><h1>${esc(p.title)}</h1>${safeUrl(p.url) ? `<a class="source-link" href="${esc(safeUrl(p.url))}" target="_blank" rel="noreferrer">${esc(p.url)} ${icon('external', 11)}</a>` : ''}<div class="detail-tools">${action('reader', p.type === 'pdf' ? 'PDF viewer' : 'Read offline', p.type === 'pdf' ? 'file' : 'book')}${action('edit-page', 'Edit page', 'tag')}${action('translate-page', 'Translate', 'languages')}${action('read-aloud', 'Read aloud', 'book')}${action('capture-source', 'Quick note / audio', 'mic')}${action('bookmark', p.bookmarked ? 'Bookmarked' : 'Bookmark', 'bookmark', p.bookmarked ? 'primary' : '')}${action('copy-notion', 'Copy for Notion', 'external')}${action('download-md', 'Download .md', 'file')}${action('export-page', 'More exports', 'arrow')}${action('delete-page', 'Delete', 'trash', 'danger')}</div>${p.collection ? `<span class="tag">${esc(p.collection)}</span>` : ''}<div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="section-label">Page note</div><div class="note-preview">${p.note ? markdown(p.note) : '<p class="muted">Add a thought about this page with “Edit page”.</p>'}</div><div class="section-label">Voice recordings</div><div data-saved-audio></div><div class="section-label">On-device AI</div><div class="row wrap small">${action('summary', 'Summarize')}${action('chat', 'Ask this page')}${action('ai-cards', 'Draft flashcards')}</div><p class="muted small" style="margin-top:8px">Runs locally when supported by your browser. Model setup may require a download.</p>${p.summary ? `<div class="note-preview">${markdown(p.summary)}</div>` : ''}<div id="ai-status" class="muted small" role="status"></div><div class="row between section-label"><span>Highlights & notes</span>${action('add-note', 'Add note', 'plus', 'ghost')}</div>${hs.length ? hs.map((h) => `<article class="annotation" style="--highlight:${h.color}"><blockquote>${esc(h.text)}</blockquote><div class="note-preview">${markdown(h.note)}</div>${h.originalText ? `<details class="repair-history"><summary>Original quote before repair</summary><blockquote>${esc(h.originalText)}</blockquote><p class="muted small">The last 10 replaced locations are retained in full backups.</p></details>` : ''}<div class="tags">${h.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="annotation-actions"><button data-jump="${h.id}">Find</button>${p.type !== 'pdf' ? `<button data-repair-highlight="${h.id}">Repair location</button>` : ''}<button data-translate-highlight="${h.id}">Translate</button><button data-card="${h.id}">${icon('flash', 12)} Study</button><button data-edit="${h.id}">Edit</button><button data-delete="${h.id}" aria-label="Delete highlight" class="danger">${icon('trash', 13)}</button></div></article>`).join('') : '<p class="muted small">No highlights yet. Open this page and select a passage.</p>'}</div>`;
  const workspace = document.querySelector('.workspace');
  workspace.append(drawer);
  renderAudioNotes(drawer.querySelector('[data-saved-audio]'), { pageId: p.id })
    .then((cleanup) => {
      if (drawer.isConnected) releaseDetailAudio = cleanup;
      else cleanup();
    })
    .catch((e) => toast(e.message));
  drawer.scrollTop = detailScroll;
  drawer.onscroll = () => {
    detailScroll = drawer.scrollTop;
  };
  drawer.querySelector('[data-collapse]').onclick = toggleDetails;
  applyDetailLayout();
  configureResizer(drawer.querySelector('.detail-resizer'));
  drawer
    .querySelectorAll('[data-translate-highlight]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          translateHighlight(
            state.highlights.find((h) => h.id === b.dataset.translateHighlight),
          ).catch((e) => toast(e.message))),
    );
  drawer.querySelector('[data-close]').onclick = closeDetail;
  bindActions(drawer, p);
  drawer
    .querySelectorAll('[data-edit]')
    .forEach(
      (b) =>
        (b.onclick = () => editHighlight(state.highlights.find((h) => h.id === b.dataset.edit))),
    );
  drawer.querySelectorAll('[data-delete]').forEach(
    (b) =>
      (b.onclick = () =>
        confirmAction('Delete highlight?', 'This also removes its linked flashcards.', async () => {
          await api('delete-highlight', { id: b.dataset.delete });
          await refresh();
        })),
  );
  drawer
    .querySelectorAll('[data-card]')
    .forEach(
      (b) => (b.onclick = () => newCard(state.highlights.find((h) => h.id === b.dataset.card))),
    );
  drawer
    .querySelectorAll('[data-jump]')
    .forEach((b) => (b.onclick = () => jump(p, b.dataset.jump)));
  drawer.querySelectorAll('[data-repair-highlight]').forEach((button) => {
    button.onclick = () =>
      repairLocation(
        p,
        state.highlights.find((item) => item.id === button.dataset.repairHighlight),
      );
  });
}
function editHighlight(h) {
  dialog({
    title: 'Edit annotation',
    recordingTarget: { pageId: h.pageId, highlightId: h.id },
    body: `<blockquote>${esc(h.text)}</blockquote><label class="field">Color<input name="color" type="color" value="${h.color}"></label><label class="field">Note · Markdown<textarea name="note">${esc(h.note)}</textarea></label>${field('Tags · comma separated', 'tags', h.tags.join(', '))}`,
    onSubmit: async (f) => {
      await api('update-highlight', { id: h.id, patch: Object.fromEntries(f) });
      await refresh();
      toast('Annotation saved');
    },
  });
}
function editPage(p) {
  dialog({
    title: 'Edit page',
    recordingTarget: { pageId: p.id },
    body: `${field('Title', 'title', p.title)}${field('Collection · use / for a nested folder', 'collection', p.collection)}${field('Tags · comma separated', 'tags', p.tags.join(', '))}<label class="field">Page note · Markdown<textarea name="note">${esc(p.note)}</textarea></label>`,
    onSubmit: async (f) => {
      await api('save-page', { url: p.url, ...Object.fromEntries(f) });
      await refresh();
    },
  });
}
function newCard(h) {
  dialog({
    title: 'Make a flashcard',
    body: `${field('Question', 'question')}<label class="field">Answer<textarea name="answer">${esc(h.text)}</textarea></label>`,
    onSubmit: async (f) => {
      await api('add-card', { pageId: h.pageId, highlightId: h.id, ...Object.fromEntries(f) });
      await refresh();
      toast('Flashcard ready to review');
    },
  });
}
function repairLocation(page, highlight) {
  const live = !!safeUrl(page.url);
  const offline = !!(page.article || page.type === 'note' || page.text);
  if (!live && !offline) return toast('Save an offline article before repairing this source.');
  dialog({
    title: 'Repair highlight location',
    submit: 'Choose replacement passage',
    body: `<p>Choose where to select the replacement passage. The same highlight keeps its notes, color, tags, flashcards and audio. Its original quotation is retained.</p><blockquote>${esc(highlight.text)}</blockquote><label class="field">Repair in<select name="repairWhere">${live ? '<option value="live">Original website</option>' : ''}${offline ? '<option value="offline">Saved offline article</option>' : ''}</select></label><p class="muted small">Select a new passage, review the previous and replacement text, then save. A changed live quote may not exist in an older offline copy; recapture the article if needed. PDF location repair is not included yet.</p>`,
    onSubmit: async (form) => {
      if (form.get('repairWhere') === 'offline') {
        await extension.tabs.create({
          url:
            extension.runtime.getURL('reader.html') +
            '?' +
            new URLSearchParams({ id: page.id, repair: highlight.id }),
        });
        return;
      }
      let target;
      for (const tab of await extension.tabs.query({})) {
        try {
          const result = await extension.tabs.sendMessage(tab.id, { action: 'status' });
          if (result?.data?.url && canonicalUrl(result.data.url) === page.url) {
            target = tab;
            break;
          }
        } catch {}
      }
      target ||= await extension.tabs.create({ url: page.url });
      await extension.tabs.update(target.id, { active: true });
      if (target.windowId) await extension.windows.update(target.windowId, { focused: true });
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const response = await extension.tabs.sendMessage(target.id, {
            action: 'repair',
            id: highlight.id,
          });
          if (response?.ok) return;
          if (response?.error && !response.error.includes('Reload this source'))
            throw new Error(response.error);
        } catch (error) {
          if (attempt === 39)
            throw new Error(
              'Margin could not start repair. Refresh the source, check site access, then try Repair location again. ' +
                error.message,
              { cause: error },
            );
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      throw new Error('Resume Margin on this website and try Repair location again.');
    },
  });
}
async function jump(p, id) {
  if (p.type === 'pdf')
    return extension.tabs.create({
      url: extension.runtime.getURL('pdf.html') + '?id=' + p.id + '&highlight=' + id,
    });
  let tab;
  for (const t of await extension.tabs.query({})) {
    try {
      const status = await extension.tabs.sendMessage(t.id, { action: 'status' });
      if (status?.data?.url && canonicalUrl(status.data.url) === p.url) {
        tab = t;
        break;
      }
    } catch {
      /* Chrome protects internal tabs. */
    }
  }
  if (tab) {
    await extension.tabs.update(tab.id, { active: true });
    try {
      await extension.tabs.sendMessage(tab.id, { action: 'focus', id });
    } catch {
      toast('Reload the page to activate Margin.');
    }
  } else {
    const url = extension.runtime.getURL('reader.html') + '?id=' + p.id + '&highlight=' + id;
    if (p.article || p.type === 'note') await extension.tabs.create({ url });
    else {
      await extension.tabs.create({ url: p.url });
      toast('Open the Margin sidebar to find this highlight after the page loads.');
    }
  }
}
function exportDialog(initialPages, initial = 'md') {
  let pages = initialPages;
  let hs = state.highlights.filter((h) => pages.some((p) => p.id === h.pageId));
  const modal = dialog({
    title: 'Take your research with you',
    body: `<div class="export-summary"><span>${pages.length} documents</span><span>${hs.length} highlights</span><span>Notes & source links included</span></div><div class="destinations"><button type="button" data-destination="notion"><b>N</b><strong>Notion</strong><span>One Markdown file per page</span></button><button type="button" data-destination="md"><b>↓</b><strong>Markdown</strong><span>A portable research document</span></button><button type="button" data-destination="agent"><b>✦</b><strong>AI agents</strong><span>Sources, metadata & stable IDs</span></button></div><label class="field">Export format<select name="format"><option value="md">Markdown document (.md)</option><option value="notion">Notion import bundle (.zip)</option><option value="notion-copy">Copy formatted text for Notion</option><option value="agent">AI-agent research bundle (.zip)</option><option value="clipboard">Copy Markdown to clipboard</option><option value="json">Full backup · JSON (entire library)</option><option value="html">HTML · formatted, with colors</option><option value="csv">CSV · spreadsheets</option><option value="print">Print / Save as PDF</option></select></label><div class="export-options"><label><input type="checkbox" name="metadata"> Include YAML metadata</label><label><input type="checkbox" name="source"> Include saved source text</label></div><div id="export-guidance" class="export-guidance"></div><div data-password>${field('Optional password · encrypts JSON backup', 'password', '', 'password')}</div><details class="export-preview"><summary>Preview Markdown</summary><pre id="export-preview"></pre></details>`,
    submit: 'Export',
    onSubmit: async (f) => {
      if (f.get('password') && f.get('format') !== 'json')
        throw new Error('Password encryption is available for JSON backups.');
      if (!pages.length && f.get('format') !== 'json')
        throw new Error('Add a document or highlight before exporting.');
      await exportData(f.get('format'), pages, hs, f.get('password'), {
        metadata: f.has('metadata'),
        includeSource: f.has('source'),
      });
      if (f.get('format') === 'json') await refresh();
      toast(
        f.get('format').includes('copy') || f.get('format') === 'clipboard'
          ? 'Copied. Paste into your notes app.'
          : 'Your export is ready',
      );
    },
  });
  modal.classList.add('export-modal');
  const select = modal.querySelector('[name=format]');
  select.value = initial;
  const update = () => {
    const format = select.value,
      backup = format === 'json';
    const summaryPages = backup ? state.pages : pages;
    modal.querySelector('.export-summary').innerHTML =
      `<span>${summaryPages.length} documents</span><span>${state.highlights.filter((item) => summaryPages.some((page) => page.id === item.pageId)).length} highlights</span><span>Notes & source links included</span>`;
    for (const button of modal.querySelectorAll('[data-save-preset],[data-update-preset]'))
      button.disabled = backup;
    modal.querySelector('[data-password]').hidden = !backup;
    modal.querySelector('[name=password]').disabled = !backup;
    modal.querySelector('.export-options').hidden =
      backup || ['csv', 'print', 'html'].includes(format);
    modal
      .querySelectorAll('[data-destination]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.destination === format)));
    modal.querySelector('#export-guidance').textContent = backup
      ? 'Backs up the entire library, including PDF attachments. Keep your password safe; it cannot be recovered.'
      : format === 'notion'
        ? 'In Notion: Settings → Import → Text & Markdown. Select the extracted .md files, or use the ZIP importer. This download stays local until you import it.'
        : format === 'notion-copy'
          ? 'Copies formatted text and a plain-text version. Open a Notion page and paste. Formatting may vary by editor.'
          : format === 'agent'
            ? 'A local ZIP with one Markdown file per document, YAML metadata, a structured manifest, and source-handling guidance. Share only the documents you intend to give an agent.'
            : 'Exports the current selection or visible filtered documents. Saved source text is included only when you choose it.';
    modal.querySelector('#export-preview').textContent =
      researchMarkdown(pages.slice(0, 1), hs, {
        metadata: modal.querySelector('[name=metadata]').checked || format === 'agent',
        includeSource: modal.querySelector('[name=source]').checked,
      }).slice(0, 5000) || 'No documents selected.';
    modal.querySelector('[type=submit]').textContent =
      format === 'notion-copy' || format === 'clipboard'
        ? 'Copy to clipboard'
        : backup
          ? 'Download backup'
          : 'Download export';
  };
  setupPresets(modal, state, {
    apply: (preset, config) => {
      pages = presetPages(config, state, initialPages);
      hs = state.highlights.filter((item) => pages.some((page) => page.id === item.pageId));
      if (preset) {
        select.value = preset.format;
        modal.querySelector('[name=metadata]').checked = preset.metadata;
        modal.querySelector('[name=source]').checked = preset.includeSource;
      }
      update();
    },
    read: () => ({
      format: select.value,
      metadata: modal.querySelector('[name=metadata]').checked,
      includeSource: modal.querySelector('[name=source]').checked,
    }),
    changed: (presets) => {
      state.exportPresets = presets;
      renderContent();
    },
  });
  select.onchange = update;
  modal.querySelectorAll('.export-options input').forEach((input) => (input.onchange = update));
  modal.querySelectorAll('[data-destination]').forEach(
    (b) =>
      (b.onclick = () => {
        select.value = b.dataset.destination;
        update();
      }),
  );
  update();
}
function renderSettings(content) {
  content.innerHTML = `<div class="page-heading"><span class="eyebrow">Make yourself at home</span><h1>Settings & backups</h1><p class="muted">Your research stays on this device, with optional Google Drive sync.</p></div><section class="settings-section"><h2>Highlight your way</h2><p>Choose a palette that fits your thinking. Click any color to change it.</p><div class="row wrap" id="palette">${state.settings.colors.map((c, i) => `<label class="field" style="margin:10px 0">Color ${i + 1}<input type="color" data-palette="${i}" value="${c}" aria-label="Palette color ${i + 1}"></label>`).join('')}${action('add-color', 'Add color', 'plus')}</div><div class="setting-row"><label for="selection-toolbar">Show toolbar when text is selected</label><input id="selection-toolbar" type="checkbox" ${state.settings.selectionToolbar ? 'checked' : ''}></div><div class="setting-row"><label for="theme">Appearance</label><select id="theme">${['light', 'dark', 'sepia', 'contrast', 'auto'].map((t) => `<option ${state.settings.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><p style="margin-top:16px">Shortcuts: Alt S · highlight, Alt Q · quick mode, Alt L · library. Configure conflicts in <strong>${browserTarget === 'firefox' ? 'about:addons → Manage Extension Shortcuts' : `${browserTarget}://extensions/shortcuts`}</strong>.</p></section><section class="settings-section"><h2>Your data, in your hands</h2><p>Back up regularly. Uninstalling Margin or deleting your browser profile removes local data. Backups include your saved articles, highlights, notes, cards, settings, and PDF attachments.</p><div class="row wrap">${action('export', 'Export & back up', 'arrow', 'primary')}${action('import', 'Import backup', 'plus')}</div><p style="margin-top:15px">Import merges records and keeps existing pages. It never clears your library. Settings stay as configured on this device.</p></section><section class="settings-section"><h2>Privacy by design</h2><p>An account is optional. No subscriptions or analytics. Google Drive sync starts only when you connect and allow it. Research is stored in this extension’s IndexedDB database. The library never loads remote fonts, icons, or cover images.</p><p>Website access is used to restore highlights and show the selection toolbar. Additional website access is requested for remote PDFs, Google Cloud translation, or Google Drive sync. On-device AI can download a browser model; it does not send your research to a server.</p><p>Paused sites: ${state.settings.disabledSites.length ? esc(state.settings.disabledSites.join(', ')) : 'None'}</p><div class="row">${action('resume-sites', 'Resume all sites')}${action('guide', 'Installation & help', 'book')}</div></section>`;
  content.querySelectorAll('[data-palette]').forEach(
    (input) =>
      (input.onchange = async () => {
        const colors = [...state.settings.colors];
        colors[+input.dataset.palette] = input.value;
        await api('settings', { colors });
        await refresh();
      }),
  );
  content.querySelector('#selection-toolbar').onchange = async (e) => {
    await api('settings', { selectionToolbar: e.target.checked });
    state.settings.selectionToolbar = e.target.checked;
  };
  content.querySelector('#theme').onchange = async (e) => {
    await api('settings', { theme: e.target.value });
    await refresh();
  };
  addLanguageSettings(content);
  addExperienceSettings(content, state, device, {
    backup: () => exportDialog(state.pages, 'json'),
    refresh,
    showGuide: async () => {
      revealGuide();
      view = 'all';
      filters = {};
      closeDetail();
      await refresh();
      document.querySelector('.onboarding-guide')?.setAttribute('open', '');
    },
  });
  addDriveSettings(content);
  bindActions(content);
}
function renderStudy(content) {
  const due = state.cards.filter((c) => c.dueAt <= Date.now()).sort((a, b) => a.dueAt - b.dueAt);
  const card = due[0];
  content.innerHTML = `<div class="page-heading"><span class="eyebrow">Read. Remember. Repeat.</span><h1>A little learning, every day.</h1><p class="muted">${due.length} cards due · ${state.cards.length} cards in your library</p></div>${card ? `<div class="study-card"><span class="eyebrow">${esc(state.pages.find((p) => p.id === card.pageId)?.title || 'Your research')}</span><div class="question">${esc(card.question)}</div>${studyRevealed ? `<div class="answer">${esc(card.answer)}</div><p class="muted small">How did you do?</p><div class="study-actions"><button data-grade="false">Review again · 10 min</button><button data-grade="true" class="primary">I remembered</button></div>` : action('reveal', 'Reveal answer', '', 'primary')}</div>` : `<div class="empty"><div class="illustration">${icon('flash', 32)}</div><h2>${state.cards.length ? 'You’re all caught up.' : 'Turn a highlight into something you know.'}</h2><p>${state.cards.length ? 'Come back when your next cards are due.' : 'Open a saved page and choose Study beside a highlight to create your first flashcard.'}</p></div>`}<div class="section-label">Your cards</div><div class="card-list">${state.cards.map((c) => `<div class="row between"><div><strong>${esc(c.question)}</strong><div class="muted small">Next review: ${new Date(c.dueAt).toLocaleString()}</div></div><button class="icon-btn danger" data-delete-card="${c.id}" aria-label="Delete flashcard">${icon('trash')}</button></div>`).join('')}</div>`;
  content.querySelectorAll('[data-grade]').forEach(
    (b) =>
      (b.onclick = async () => {
        await api('grade-card', { id: card.id, correct: b.dataset.grade === 'true' });
        studyRevealed = false;
        await refresh();
      }),
  );
  content.querySelectorAll('[data-delete-card]').forEach(
    (b) =>
      (b.onclick = () =>
        confirmAction(
          'Delete flashcard?',
          'Your source highlight will stay in the library.',
          async () => {
            await api('delete-card', { id: b.dataset.deleteCard });
            await refresh();
          },
        )),
  );
  bindActions(content);
}
function guide() {
  dialog({
    title: 'Welcome to Margin',
    submit: 'Got it',
    body: `<p><strong>1. Install</strong> ${browserTarget === 'firefox' ? 'For this development build, open <strong>about:debugging#/runtime/this-firefox</strong>, choose “Load Temporary Add-on”, and select <strong>dist-firefox/manifest.json</strong>. It lasts until Firefox closes. Permanent installation requires a Mozilla-signed build.' : `Open <strong>${browserTarget}://extensions</strong>, enable Developer mode, choose “Load unpacked”, and select the <strong>${browserTarget === 'chrome' ? 'dist' : `dist-${browserTarget}`}</strong> folder.`} Pin Margin to your toolbar.</p><p><strong>2. Highlight</strong> Reload any tabs opened before installation. Select text on a website and pick a color. Click a highlight to add notes and tags. Try Alt S or Alt Q.</p><p><strong>3. Organize</strong> Open your library to search, add collections, export, and make flashcards. Use your browser’s sidebar for notes beside your page.</p><p><strong>4. PDFs</strong> Choose “Add to library → PDF”. Local files work offline. For remote PDFs, paste the URL and grant access to that site.</p><p><strong>5. YouTube</strong> Open a video’s “Show transcript” panel, then use Margin’s “Save for offline reading”. Captured transcript timestamps link back to the video.</p><p class="muted small">Browsers protect internal pages, extension stores, and built-in PDF viewers from highlighting. Use the bundled PDF viewer instead. Scanned PDFs need an existing text layer. File URL access is optional in the extension’s Details page. Websites can change and some quotes may need to be located manually; they always remain in your library.</p>`,
    onSubmit: () => {},
  });
}
async function runAI(kind, p, question = '') {
  const status = document.querySelector('#ai-status');
  if (!p.text) throw new Error('Save this page for offline reading first using the Margin popup.');
  const buttons = [
    ...document.querySelectorAll(
      '.drawer [data-action="summary"],.drawer [data-action="ai-cards"],.drawer [data-action="chat"]',
    ),
  ];
  buttons.forEach((b) => (b.disabled = true));
  try {
    if (status) status.textContent = 'Working locally…';
    const result = await localAI(kind, p.text, question, (s) => {
      if (status) status.textContent = s;
    });
    if (kind === 'summary') {
      await api('save-page', { url: p.url, summary: result });
      await refresh();
    } else if (kind === 'cards') {
      const parsed = JSON.parse(result.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (!Array.isArray(parsed))
        throw new Error('The local model did not return valid flashcards. Try again.');
      for (const c of parsed.slice(0, 5))
        await api('add-card', { pageId: p.id, question: c.question, answer: c.answer });
      await refresh();
      toast('Draft cards saved. Review their accuracy before studying.');
    } else {
      dialog({
        title: 'Answer from your page',
        body: `<p class="muted small">Based on the first 24,000 characters. AI answers may be inaccurate.</p><div class="note-preview">${markdown(result)}</div>`,
        submit: 'Done',
        onSubmit: () => {},
      });
    }
    if (status) status.textContent = '';
  } finally {
    buttons.forEach((b) => (b.disabled = false));
    if (status?.isConnected) status.textContent = '';
  }
}
function bindActions(root, page) {
  root
    .querySelectorAll('[data-action]')
    .forEach(
      (b) =>
        (b.onclick = () => handleAction(b.dataset.action, page).catch((e) => toast(e.message))),
    );
}
async function handleAction(name, p) {
  if (name === 'clear') {
    filters = {};
    history.replaceState(null, '', '#' + view);
    render();
  }
  if (name === 'guide') guide();
  if (name === 'export') exportDialog(exportSelection(), view === 'settings' ? 'json' : 'md');
  if (name === 'export-page') exportDialog([p]);
  if (name === 'export-notion') exportDialog(exportSelection(), 'notion');
  if (name === 'export-markdown') exportDialog(exportSelection(), 'md');
  if (name === 'export-agent') exportDialog(exportSelection(), 'agent');
  if (name === 'copy-notion' || name === 'download-md') {
    const pages = p ? [p] : exportSelection();
    await exportData(name === 'copy-notion' ? 'notion-copy' : 'md', pages, state.highlights);
    toast(
      name === 'copy-notion'
        ? 'Copied formatted text. Paste it into Notion.'
        : 'Markdown downloaded',
    );
  }
  if (name === 'import-markdown') {
    document.querySelector('dialog[open]')?.close();
    markdownDialog();
  }
  if (name === 'edit-page' || name === 'add-note') editPage(p);
  if (name === 'capture-source') await api('open-capture', { pageId: p.id, mode: 'voice' });
  if (name === 'read-aloud')
    openReadAloud(
      p.text ||
        p.note ||
        counts(p)
          .map((h) => h.text)
          .join('\n\n'),
    );
  if (name === 'translate-page')
    await openTranslation({
      text:
        p.text ||
        p.note ||
        counts(p)
          .map((h) => h.text)
          .join('\n\n'),
      onSave: async (result) => {
        const latest = await api('page-data', { url: p.url });
        await api('save-page', { url: p.url, note: appendTranslation(latest.page.note, result) });
        await refresh();
      },
    });
  if (name === 'voice-note') {
    await handleAction('new-note');
    const assist = document.querySelector('dialog[open] .note-assist');
    if (assist) assist.open = true;
  }
  if (name === 'bookmark') {
    await api('save-page', { url: p.url, bookmarked: !p.bookmarked });
    await refresh();
  }
  if (name === 'reader')
    await extension.tabs.create({
      url: extension.runtime.getURL(p.type === 'pdf' ? 'pdf.html' : 'reader.html') + '?id=' + p.id,
    });
  if (name === 'delete-page')
    confirmAction(
      'Delete this page?',
      'Its highlights, notes, PDF attachment, and flashcards will also be deleted.',
      async () => {
        await api('delete-page', { id: p.id });
        closeDetail();
        await refresh();
      },
    );
  if (name === 'delete-selected')
    confirmAction(
      'Delete selected pages?',
      `${selected.size} pages and their annotations will be deleted.`,
      async () => {
        for (const id of selected) await api('delete-page', { id });
        selected.clear();
        await refresh();
      },
    );
  if (name === 'move')
    moveSourcesDialog([...selected], state, organizationChanged, filters.collection || '');
  if (name === 'collection')
    createCollectionDialog(state, organizationChanged, filters.collection || '');
  if (name === 'add')
    (dialog({
      title: 'Add to your library',
      body: `<div class="row wrap">${action('pdf', 'Open a PDF', 'file')}${action('new-note', 'Write a note', 'book')}${action('import-markdown', 'Import Markdown', 'file')}</div><hr style="border:0;border-top:1px solid var(--line);margin:25px 0">${field('Or save a website URL', 'url', '', 'url')}${field('Title · optional', 'title')}`,
      submit: 'Save bookmark',
      onSubmit: async (f) => {
        const url = safeUrl(f.get('url'));
        if (!url) throw new Error('Enter a valid website address');
        await api('save-page', { url, title: f.get('title') || url, bookmarked: true });
        await refresh();
      },
    }),
      bindActions(document.querySelector('dialog:last-of-type')));
  if (name === 'new-note') {
    document.querySelector('dialog')?.close();
    dialog({
      title: 'A note to keep',
      body: `${field('Title', 'title')}<label class="field">Note · Markdown<textarea name="note" style="height:200px"></textarea></label>${field('Tags', 'tags')}`,
      onSubmit: async (f) => {
        const note = f.get('note');
        const page = await api('save-page', {
          url: 'local://note/' + crypto.randomUUID(),
          type: 'note',
          title: f.get('title') || 'Untitled note',
          note,
          text: note,
          article: '',
          tags: f.get('tags'),
        });
        await refresh();
        openDetail(page.id);
        return { pageId: page.id };
      },
    });
  }
  if (name === 'pdf') {
    document.querySelector('dialog')?.close();
    pdfDialog();
  }
  if (name === 'import') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      try {
        const file = input.files[0];
        if (file.size > 300 * 1024 * 1024) throw new Error('Backup is too large (maximum 300 MB).');
        let data = JSON.parse(await file.text());
        if (data.format === 'margin-encrypted') {
          dialog({
            title: 'Unlock backup',
            body: field('Backup password', 'password', '', 'password'),
            submit: 'Import',
            onSubmit: async (f) => {
              data = await decryptBackup(data, f.get('password'));
              await mergeBackup(data);
            },
          });
        } else await mergeBackup(data);
      } catch (e) {
        toast(e.message);
      }
    };
    input.click();
  }
  if (name === 'add-color') {
    if (state.settings.colors.length >= 12) throw new Error('Palette supports up to 12 colors');
    await api('settings', { colors: [...state.settings.colors, '#f6c99b'] });
    await refresh();
  }
  if (name === 'resume-sites') {
    await api('settings', { disabledSites: [] });
    await refresh();
    toast('Margin resumed on all sites');
  }
  if (name === 'reveal') {
    studyRevealed = true;
    renderContent();
  }
  if (name === 'summary') await runAI('summary', p);
  if (name === 'ai-cards') await runAI('cards', p);
  if (name === 'chat')
    dialog({
      title: 'Ask your page',
      body: field('Your question', 'question'),
      submit: 'Ask locally',
      onSubmit: async (f) => {
        await runAI('chat', p, f.get('question'));
      },
    });
}
function pdfDialog() {
  dialog({
    title: 'Open a PDF',
    body: `<label class="field">Local PDF<input name="file" type="file" accept="application/pdf,.pdf"></label><p class="muted small">Stored locally, including in your backups. Maximum 50 MB per PDF. Scans without selectable text cannot be highlighted.</p>${field('Or paste a remote PDF URL', 'url', '', 'url')}`,
    submit: 'Open PDF',
    onSubmit: async (f, el) => {
      const file = f.get('file');
      const url = f.get('url');
      if (!file?.size && !url) throw new Error('Choose a PDF file or enter its URL');
      let buffer, title, source;
      if (file?.size) {
        if (file.size > 50 * 1024 * 1024) throw new Error('PDF exceeds 50 MB limit');
        buffer = await file.arrayBuffer();
        title = file.name;
        source = 'local://pdf/' + crypto.randomUUID();
      } else {
        const u = new URL(url);
        if (!['http:', 'https:'].includes(u.protocol))
          throw new Error('Use an HTTP or HTTPS PDF URL');
        const granted = await extension.permissions.request({ origins: [u.origin + '/*'] });
        if (!granted)
          throw new Error(
            'Site access is required to download this PDF. You can download it yourself and open the local file.',
          );
        el.querySelector('[type=submit]').textContent = 'Downloading…';
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error('Could not download PDF: ' + response.status);
        buffer = await response.arrayBuffer();
        title = decodeURIComponent(u.pathname.split('/').pop()) || 'PDF document';
        source = url;
      }
      const page = await importPDF(buffer, title, source);
      await refresh();
      await extension.tabs.create({ url: extension.runtime.getURL('pdf.html') + '?id=' + page.id });
    },
  });
}
document.addEventListener('keydown', (e) => {
  if (
    e.altKey &&
    e.key.toLowerCase() === 'm' &&
    selected.size &&
    !document.querySelector('dialog[open]') &&
    !e.target.closest('textarea,input:not([type=checkbox]),select,[contenteditable=true]')
  ) {
    e.preventDefault();
    moveSourcesDialog([...selected], state, organizationChanged, filters.collection || '');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    app.querySelector('#search')?.focus();
  }
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeDetail();
});
const hash = location.hash;
if (hash === '#settings') view = 'settings';
else if (hash === '#study') view = 'study';
else if (hash === '#unfiled') filters = { unfiled: true };
else if (hash.startsWith('#collection='))
  filters = { collection: decodeURIComponent(hash.slice(12)) };
else if (hash.startsWith('#page=')) detailId = decodeURIComponent(hash.slice(6));
async function mergeBackup(data) {
  const id = 'pending-import:' + crypto.randomUUID();
  await put('settings', { id, value: data });
  try {
    await api('commit-import', { id });
  } finally {
    await deleteSetting(id);
  }
  await refresh();
  toast('Backup merged into your library');
}
extension.storage.onChanged.addListener((changes) => {
  if ((changes.revision || changes.deviceRevision) && !document.querySelector('dialog[open]'))
    refresh().catch((e) => toast(e.message));
});
refresh().catch((e) => {
  app.innerHTML = `<div class="loading">${esc(e.message)}</div>`;
});

function exportSelection() {
  return selected.size
    ? state.pages.filter((p) => selected.has(p.id))
    : view === 'settings' || view === 'study'
      ? state.pages
      : searchPages(state.pages, state.highlights, {
          ...filters,
          bookmarked: view === 'bookmarks',
        });
}
function markdownDialog() {
  dialog({
    title: 'Bring your Markdown along',
    submit: 'Add to library',
    body:
      '<p class="muted">Import notes from an AI agent, a writing app, or your own files. The original Markdown stays editable and can be highlighted in the reader.</p><label class="field file-drop">Choose Markdown files<input type="file" name="files" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple><span class="muted small">Up to 50 files · 5 MB each · 20 MB total</span></label><div class="or-divider">or paste your Markdown</div><label class="field"><textarea name="markdown" rows="7" placeholder="# A thought worth keeping&#10;&#10;Paste your document here…"></textarea></label>' +
      field('Collection · optional', 'collection') +
      field('Tags · comma separated', 'tags'),
    onSubmit: async (form, modal) => {
      const files = form.getAll('files').filter((f) => f.size),
        text = String(form.get('markdown') || '');
      if (!files.length && !text.trim())
        throw new Error('Choose a Markdown file or paste a document.');
      if (files.length && text.trim())
        throw new Error('Choose files or pasted Markdown for this import.');
      if (files.length > 50 || files.reduce((sum, f) => sum + f.size, 0) > 20 * 1024 * 1024)
        throw new Error('Import at most 50 files and 20 MB at a time.');
      const prepared = [];
      for (const file of files) {
        if (!/\.(md|markdown|txt)$/i.test(file.name))
          throw new Error('Choose .md, .markdown, or .txt files.');
        if (file.size > 5 * 1024 * 1024) throw new Error('Keep each file under 5 MB.');
        prepared.push(await prepareMarkdown(await file.text(), file.name));
      }
      if (text.trim()) prepared.push(await prepareMarkdown(text));
      const existing = new Set(state.pages.map((p) => p.url));
      let added = 0;
      for (const item of prepared) {
        if (existing.has(item.url)) continue;
        await api('save-page', {
          ...item,
          collection: form.get('collection'),
          tags: form.get('tags'),
        });
        existing.add(item.url);
        added++;
      }
      modal.close();
      await refresh();
      toast(
        added +
          ' document' +
          (added === 1 ? '' : 's') +
          ' added' +
          (added < prepared.length ? ' · duplicates skipped' : ''),
      );
    },
  });
}

function applyDetailLayout() {
  const workspace = document.querySelector('.workspace');
  if (!workspace || !detailId) return;
  workspace
    .querySelectorAll('[data-page]')
    .forEach((node) =>
      node.setAttribute(
        'aria-expanded',
        String(node.dataset.page === detailId && !detailsCollapsed),
      ),
    );
  workspace.classList.toggle('details-open', !detailsCollapsed);
  workspace.style.setProperty('--details-width', state.settings.detailWidth + 'px');
  const drawer = workspace.querySelector('.drawer');
  if (drawer) drawer.hidden = detailsCollapsed;
  let button = workspace.querySelector('[data-details-toggle]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.detailsToggle = 'true';
    workspace.querySelector('.topbar').append(button);
    button.onclick = toggleDetails;
  }
  button.textContent = detailsCollapsed ? 'Show highlights' : 'Hide details';
  button.setAttribute('aria-expanded', String(!detailsCollapsed));
}
function toggleDetails() {
  detailsCollapsed = !detailsCollapsed;
  applyDetailLayout();
}
function configureResizer(handle) {
  const workspace = document.querySelector('.workspace');
  const resize = (value) => {
    state.settings.detailWidth = Math.min(720, Math.max(360, value));
    workspace.style.setProperty('--details-width', state.settings.detailWidth + 'px');
    handle.setAttribute('aria-valuenow', state.settings.detailWidth);
  };
  handle.onpointerdown = (e) => {
    e.preventDefault();
    const start = e.clientX,
      width = document.querySelector('.drawer').getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
    workspace.classList.add('is-resizing');
    handle.onpointermove = (move) => resize(width + start - move.clientX);
    handle.onpointerup = () => {
      handle.onpointermove = null;
      workspace.classList.remove('is-resizing');
      api('settings', { detailWidth: state.settings.detailWidth }).catch((e) => toast(e.message));
    };
  };
  handle.onkeydown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    resize(
      e.key === 'Home'
        ? 360
        : e.key === 'End'
          ? 720
          : state.settings.detailWidth + (e.key === 'ArrowLeft' ? 24 : -24),
    );
    api('settings', { detailWidth: state.settings.detailWidth }).catch((e) => toast(e.message));
  };
}
function appendTranslation(note, result) {
  return (
    (note ? note + '\n\n' : '') +
    '### Translation (' +
    result.source +
    ' → ' +
    result.target +
    ')\n\n' +
    result.text
  );
}
async function translateHighlight(h) {
  await openTranslation({
    text: h.text,
    onSave: async (result) => {
      const page = state.pages.find((p) => p.id === h.pageId),
        latest = await api('page-data', { url: page.url }),
        current = latest.highlights.find((x) => x.id === h.id);
      if (!current) throw new Error('This highlight was deleted.');
      await api('update-highlight', {
        id: h.id,
        patch: { note: appendTranslation(current.note, result) },
      });
      await refresh();
    },
  });
}
function addLanguageSettings(content) {
  const section = document.createElement('section');
  section.className = 'settings-section';
  section.innerHTML =
    '<h2>Voice & translation</h2><p>Dictate into note editors or translate documents and highlights. Local modes never silently fall back to an online service.</p><label class="field">Default translation output language<input data-default-translation value="' +
    esc(state.settings.translationTarget) +
    '" placeholder="fa = Persian, en = English"></label><label class="field">Default spoken language<input data-default-speech value="' +
    esc(state.settings.voiceLanguage) +
    '" placeholder="fa-IR, en-US, …"></label><div class="row wrap"><button data-language-save type="button">Save language defaults</button><button data-key-clear type="button">Forget Google API key</button></div><p data-language-status class="muted small" role="status"></p><p class="muted small">Google Cloud requires your own enabled API key and may charge your project. Keys are kept only for this browser session, never in exports or backups. Browser speech may send audio to its provider when you explicitly allow it.</p>';
  content.append(section);
  section.querySelector('[data-language-save]').onclick = async () => {
    try {
      await api('settings', {
        translationTarget: section.querySelector('[data-default-translation]').value,
        voiceLanguage: section.querySelector('[data-default-speech]').value,
      });
      section.querySelector('[data-language-status]').textContent = 'Language defaults saved.';
    } catch (e) {
      section.querySelector('[data-language-status]').textContent = e.message;
    }
  };
  section.querySelector('[data-key-clear]').onclick = async () => {
    await extension.storage.session.remove('googleTranslationKey');
    section.querySelector('[data-language-status]').textContent = 'Session API key removed.';
  };
}
