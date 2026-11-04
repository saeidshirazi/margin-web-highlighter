import { api } from './api.js';
import { icon, esc, dialog, field, toast } from './ui.js';
import { collectionTree, collectionPath, collectionTarget, inCollection } from './organization.js';
const collapsed = new Set();
const SOURCE_DRAG = 'application/x-margin-sources',
  FOLDER_DRAG = 'application/x-margin-collection';
const options = (pages) =>
  collectionTree(pages)
    .map((node) => `<option value="${esc(node.path)}"></option>`)
    .join('');
export function moveSourcesDialog(ids, snapshot, changed, initial = '') {
  dialog({
    title: 'Move selected sources',
    submit: 'Move sources',
    body: `<p>${ids.length} sources. Their highlights, notes, cards and audio stay attached.</p>${field('Collection path · blank means Unfiled', 'collection', initial)}<datalist id="move-collections">${options(snapshot.pages)}</datalist><p class="muted small">Use / for subcollections. Tab to the field, choose a destination, then press Enter.</p>`,
    onSubmit: async (form) =>
      changed(
        await api('move-pages', { ids, collection: form.get('collection') }),
        'Sources moved',
      ),
  });
  document
    .querySelector('dialog:last-of-type [name=collection]')
    .setAttribute('list', 'move-collections');
}
export function createCollectionDialog(snapshot, changed, parent = '') {
  dialog({
    title: 'Create a collection',
    submit: 'Create collection',
    body: `${field('Collection path · use / for subcollections', 'collection', parent ? parent + '/' : '')}<p class="muted small">Select at least one source. Collections are stored with their sources, so they appear once they contain a source.</p><div class="collection-source-picker">${snapshot.pages.map((page) => `<label><input type="checkbox" name="page" value="${esc(page.id)}">${esc(page.title)}</label>`).join('')}</div>`,
    onSubmit: async (form) =>
      changed(
        await api('move-pages', {
          ids: form.getAll('page'),
          collection: collectionTarget(form.get('collection'), false),
        }),
        'Collection created',
      ),
  });
}
function changeFolder(path, snapshot, changed, move) {
  const parts = path.split('/'),
    leaf = parts.pop(),
    parent = parts.join('/');
  const count = snapshot.pages.filter((page) => inCollection(page.collection, path)).length;
  dialog({
    title: move ? 'Move collection' : 'Rename collection',
    submit: move ? 'Move collection' : 'Rename collection',
    body: `<p><strong>${esc(path)}</strong> contains ${count} sources, including subcollections. Source and annotation IDs are preserved.</p>${field(move ? 'New parent path · blank means root' : 'New name', move ? 'parent' : 'name', move ? parent : leaf)}${move ? `<datalist id="folder-parents">${options(snapshot.pages)}</datalist>` : ''}<p class="muted small">Existing destinations are not merged. Presets pointing to this branch follow its new path.</p>`,
    onSubmit: async (form) => {
      const name = String(form.get('name') || '').trim();
      if (!move && (!name || name.includes('/')))
        throw new Error('Use one folder name. Choose Move collection to change its parent.');
      const destination = move
        ? [collectionPath(form.get('parent')), leaf].filter(Boolean).join('/')
        : [parent, name].filter(Boolean).join('/');
      return changed(
        await api('organize-collection', { from: path, to: destination }),
        move ? 'Collection moved' : 'Collection renamed',
        { from: path, to: destination },
      );
    },
  });
  if (move)
    document
      .querySelector('dialog:last-of-type [name=parent]')
      .setAttribute('list', 'folder-parents');
}
function manageFolder(path, snapshot, changed) {
  const count = snapshot.pages.filter((page) => inCollection(page.collection, path)).length;
  const modal = dialog({
    title: 'Manage collection',
    submit: 'Done',
    body: `<p><strong>${esc(path)}</strong> · ${count} sources including subcollections</p><div class="row wrap"><button type="button" data-folder-rename>Rename</button><button type="button" data-folder-move>Move collection</button><button type="button" class="danger" data-folder-remove>Remove collection labels</button></div><p class="muted small">Removing collection labels makes these sources Unfiled; it never deletes sources or annotations.</p>`,
    onSubmit: () => {},
  });
  modal.querySelector('[data-folder-rename]').onclick = () => {
    modal.close();
    changeFolder(path, snapshot, changed, false);
  };
  modal.querySelector('[data-folder-move]').onclick = () => {
    modal.close();
    changeFolder(path, snapshot, changed, true);
  };
  modal.querySelector('[data-folder-remove]').onclick = () => {
    modal.close();
    dialog({
      title: 'Remove collection labels?',
      submit: 'Remove labels',
      body: `<p>${count} sources in ${esc(path)} and its subcollections will become Unfiled. No sources, highlights, notes, cards or audio are deleted. Presets for this collection will need another destination.</p>`,
      onSubmit: async () =>
        changed(
          await api('organize-collection', { from: path, remove: true }),
          'Collection labels removed',
          { from: path, remove: true },
        ),
    });
  };
}
export function mountCollections(container, snapshot, filters, { choose, changed }) {
  const nodes = collectionTree(snapshot.pages),
    byParent = new Map();
  for (const node of nodes) {
    if (!byParent.has(node.parent)) byParent.set(node.parent, []);
    byParent.get(node.parent).push(node);
  }
  const children = (parent) => byParent.get(parent) || [];
  const branch = (parent) =>
    `<ul${parent ? ` class="collection-children" ${collapsed.has(parent) ? 'hidden' : ''}` : ''}>${children(
      parent,
    )
      .map((node) => {
        const nested = children(node.path).length > 0;
        return `<li><div class="collection-row" data-drop-collection="${esc(node.path)}"><button type="button" class="collection-expand" ${nested ? `data-expand="${esc(node.path)}" aria-expanded="${!collapsed.has(node.path)}" aria-label="Toggle ${esc(node.path)}"` : 'disabled aria-hidden="true" tabindex="-1"'}>${nested ? icon('chevron', 11) : '·'}</button><button type="button" draggable="true" data-collection="${esc(node.path)}" class="collection-nav ${filters.collection === node.path ? 'active' : ''}" ${filters.collection === node.path ? 'aria-current="page"' : ''} title="${esc(node.path)}">${icon('folder', 14)}<span class="collection-label">${esc(node.name)}</span><span class="collection-count">${node.count}</span></button><button type="button" class="collection-manage" data-manage-collection="${esc(node.path)}" aria-label="Manage ${esc(node.path)}" title="Rename, move or remove collection labels">⋯</button></div>${nested ? branch(node.path) : ''}</li>`;
      })
      .join('')}</ul>`;
  container.innerHTML = `<div class="collection-row unfiled-row" data-drop-collection=""><button type="button" data-unfiled class="${filters.unfiled ? 'active' : ''}">${icon('folder', 14)}<span>Unfiled</span><span class="collection-count">${snapshot.pages.filter((page) => !collectionPath(page.collection)).length}</span></button></div>${nodes.length ? branch('') : '<p class="muted small">Create a collection from your saved sources.</p>'}<p class="collection-help">Drop sources onto a folder, or select sources and choose Move. Shift F10 manages a focused folder.</p>`;
  container.querySelector('[data-unfiled]').onclick = () => choose(null);
  for (const button of container.querySelectorAll('[data-collection]')) {
    button.onclick = () => choose(button.dataset.collection);
    button.ondragstart = (event) => {
      event.dataTransfer.setData(FOLDER_DRAG, button.dataset.collection);
      event.dataTransfer.effectAllowed = 'move';
    };
    button.oncontextmenu = (event) => {
      event.preventDefault();
      manageFolder(button.dataset.collection, snapshot, changed);
    };
    button.onkeydown = (event) => {
      const path = button.dataset.collection;
      if (event.shiftKey && event.key === 'F10') {
        event.preventDefault();
        manageFolder(path, snapshot, changed);
        return;
      }
      if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const visible = [...container.querySelectorAll('[data-collection]')].filter(
          (item) => !item.closest('[hidden]'),
        );
        const index = visible.indexOf(button) + (event.key === 'ArrowDown' ? 1 : -1);
        visible[Math.max(0, Math.min(index, visible.length - 1))]?.focus();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const toggle = button.parentElement.querySelector('[data-expand]');
        if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
        else button.closest('li').querySelector('ul [data-collection]')?.focus();
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const toggle = button.parentElement.querySelector('[data-expand]');
        if (toggle?.getAttribute('aria-expanded') === 'true') toggle.click();
        else
          button
            .closest('ul')
            .parentElement.closest('li')
            ?.querySelector('[data-collection]')
            ?.focus();
      }
    };
  }
  for (const button of container.querySelectorAll('[data-expand]'))
    button.onclick = () => {
      const path = button.dataset.expand;
      collapsed.has(path) ? collapsed.delete(path) : collapsed.add(path);
      const expanded = !collapsed.has(path);
      button.setAttribute('aria-expanded', String(expanded));
      button.closest('li').querySelector(':scope > ul').hidden = !expanded;
    };
  for (const button of container.querySelectorAll('[data-manage-collection]'))
    button.onclick = () => manageFolder(button.dataset.manageCollection, snapshot, changed);
  for (const row of container.querySelectorAll('[data-drop-collection]')) {
    row.ondragover = (event) => {
      const types = [...event.dataTransfer.types];
      if (
        types.includes(SOURCE_DRAG) ||
        (types.includes(FOLDER_DRAG) && !row.querySelector('[data-unfiled]'))
      ) {
        event.preventDefault();
        row.classList.add('drop-target');
        event.dataTransfer.dropEffect = 'move';
      }
    };
    row.ondragleave = (event) => {
      if (!row.contains(event.relatedTarget)) row.classList.remove('drop-target');
    };
    row.ondrop = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      row.classList.remove('drop-target');
      const target = row.dataset.dropCollection;
      try {
        const folder = event.dataTransfer.getData(FOLDER_DRAG);
        if (folder) {
          if (row.querySelector('[data-unfiled]'))
            throw new Error(
              'Drop sources here to unfile them. Use Move collection with a blank parent to move a folder to the root.',
            );
          const to = [target, collectionPath(folder).split('/').at(-1)].filter(Boolean).join('/');
          await changed(
            await api('organize-collection', { from: folder, to }),
            'Collection moved',
            { from: folder, to },
          );
        } else {
          const ids = JSON.parse(event.dataTransfer.getData(SOURCE_DRAG));
          await changed(await api('move-pages', { ids, collection: target }), 'Sources moved');
        }
      } catch (error) {
        toast(error.message);
      }
    };
  }
}
export function bindSourceDragging(container, selected) {
  for (const card of container.querySelectorAll('.page-card')) {
    card.draggable = true;
    card.ondragstart = (event) => {
      if (event.target.closest('input,button')) {
        event.preventDefault();
        return;
      }
      const id = card.querySelector('[data-page]').dataset.page;
      event.dataTransfer.setData(
        SOURCE_DRAG,
        JSON.stringify(selected.has(id) ? [...selected] : [id]),
      );
      event.dataTransfer.effectAllowed = 'move';
    };
  }
}
