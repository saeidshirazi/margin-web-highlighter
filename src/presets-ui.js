import { api } from './api.js';
import { esc, toast } from './ui.js';
import { collectionTree, presetPages } from './organization.js';
const formatLabel = {
  md: 'Markdown',
  notion: 'Notion ZIP',
  agent: 'Agent ZIP',
  html: 'HTML',
  csv: 'CSV',
  clipboard: 'Copy Markdown',
  'notion-copy': 'Copy for Notion',
  print: 'Print / PDF',
};
function presetDescription(preset) {
  return `${formatLabel[preset.format]} · ${preset.scope === 'collection' ? preset.collection : preset.scope === 'all' ? 'Entire library' : 'Current selection / filtered view'}${preset.includeSource ? ' · includes saved source text' : ''}`;
}
export function addSavedExports(container, snapshot, visible, run) {
  if (!snapshot.exportPresets?.length) return;
  const section = document.createElement('section');
  section.className = 'saved-exports';
  section.setAttribute('aria-label', 'Saved exports');
  section.innerHTML = `<div><span class="eyebrow">Your export shortcuts</span><strong>Saved exports</strong></div><div class="saved-export-list">${snapshot.exportPresets.map((preset) => `<button type="button" data-run-preset="${esc(preset.id)}"><strong>${esc(preset.name)}</strong><span>${esc(presetDescription(preset))}</span><small>${presetPages(preset, snapshot, visible).length} sources</small></button>`).join('')}</div>`;
  container.querySelector('.transfer-strip')?.after(section);
  for (const button of section.querySelectorAll('[data-run-preset]'))
    button.onclick = () =>
      run(snapshot.exportPresets.find((preset) => preset.id === button.dataset.runPreset)).catch(
        (error) => toast(error.message),
      );
}
export function setupPresets(modal, snapshot, { apply, read, changed }) {
  const panel = document.createElement('details');
  panel.className = 'preset-editor';
  panel.innerHTML = `<summary>Save or reuse an export preset</summary><label class="field">Saved preset<select data-preset-select><option value="">Custom export</option>${(snapshot.exportPresets || []).map((preset) => `<option value="${esc(preset.id)}">${esc(preset.name)}</option>`).join('')}</select></label><div class="row wrap"><label class="field">Preset scope<select data-preset-scope><option value="view">Current selection / filtered view</option><option value="all">Entire library</option><option value="collection">Collection and subcollections</option></select></label><label class="field" data-preset-collection-field hidden>Collection<select data-preset-collection>${collectionTree(
    snapshot.pages,
  )
    .map((node) => `<option value="${esc(node.path)}">${esc(node.path)}</option>`)
    .join(
      '',
    )}</select></label></div><label class="field">Preset name<input data-preset-name maxlength="80" placeholder="Research for my agent"></label><div class="row wrap"><button type="button" data-save-preset>Save new preset</button><button type="button" data-update-preset hidden>Update preset</button><button type="button" class="danger" data-delete-preset hidden>Delete preset</button></div><p data-preset-status class="muted small" role="status"></p><p class="muted small">Presets store the research format, scope and export options. They never store passwords or keys. They stay in this browser and travel in full JSON backups; Google Drive does not sync presets. Collection presets follow local rename/move operations.</p>`;
  modal.querySelector('.export-summary').after(panel);
  let presets = [...(snapshot.exportPresets || [])];
  const q = (selector) => panel.querySelector(selector);
  const selected = () => presets.find((preset) => preset.id === q('[data-preset-select]').value);
  const config = () => ({
    scope: q('[data-preset-scope]').value,
    collection: q('[data-preset-collection]').value,
  });
  const refreshSelect = (id) => {
    q('[data-preset-select]').innerHTML =
      `<option value="">Custom export</option>${presets.map((preset) => `<option value="${esc(preset.id)}">${esc(preset.name)}</option>`).join('')}`;
    q('[data-preset-select]').value = id || '';
    q('[data-update-preset]').hidden = !id;
    q('[data-delete-preset]').hidden = !id;
  };
  const scopeChanged = () => {
    q('[data-preset-collection-field]').hidden = q('[data-preset-scope]').value !== 'collection';
    apply(null, config());
  };
  q('[data-preset-scope]').onchange = scopeChanged;
  q('[data-preset-collection]').onchange = scopeChanged;
  q('[data-preset-select]').onchange = () => {
    const preset = selected();
    q('[data-update-preset]').hidden = !preset;
    q('[data-delete-preset]').hidden = !preset;
    if (!preset) return;
    q('[data-preset-name]').value = preset.name;
    q('[data-preset-scope]').value = preset.scope;
    if (
      preset.scope === 'collection' &&
      ![...q('[data-preset-collection]').options].some(
        (option) => option.value === preset.collection,
      )
    ) {
      const option = document.createElement('option');
      option.value = preset.collection;
      option.textContent = preset.collection + ' (currently empty or missing)';
      q('[data-preset-collection]').append(option);
    }
    q('[data-preset-collection]').value = preset.collection;
    q('[data-preset-collection-field]').hidden = preset.scope !== 'collection';
    apply(preset, config());
  };
  async function save(update) {
    try {
      const input = {
        ...read(),
        ...config(),
        id: update ? selected()?.id : crypto.randomUUID(),
        name: q('[data-preset-name]').value,
      };
      const preset = await api('save-export-preset', input);
      presets = presets.filter((item) => item.id !== preset.id);
      presets.push(preset);
      refreshSelect(preset.id);
      q('[data-preset-status]').textContent = 'Preset saved on this browser.';
      changed(presets);
    } catch (error) {
      q('[data-preset-status]').textContent = error.message;
    }
  }
  q('[data-save-preset]').onclick = () => save(false);
  q('[data-update-preset]').onclick = () => save(true);
  q('[data-delete-preset]').onclick = async () => {
    const preset = selected();
    if (!preset) return;
    try {
      await api('delete-export-preset', { id: preset.id });
      presets = presets.filter((item) => item.id !== preset.id);
      refreshSelect('');
      q('[data-preset-status]').textContent = 'Preset deleted. Your research is unchanged.';
      changed(presets);
    } catch (error) {
      q('[data-preset-status]').textContent = error.message;
    }
  };
}
