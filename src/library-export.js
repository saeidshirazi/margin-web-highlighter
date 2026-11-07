import { exportData } from './backup.js';
import { presetPages } from './organization.js';
import { setupPresets } from './presets-ui.js';
import { researchMarkdown } from './transfer.js';
import { dialog, field, toast } from './ui.js';

export function openExportDialog(snapshot, initialPages, initial, { refresh, presetsChanged }) {
  let pages = initialPages;
  let hs = snapshot.highlights.filter((h) => pages.some((p) => p.id === h.pageId));
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
    const summaryPages = backup ? snapshot.pages : pages;
    modal.querySelector('.export-summary').innerHTML =
      `<span>${summaryPages.length} documents</span><span>${(backup ? snapshot.highlights : hs).length} highlights</span><span>Notes & source links included</span>`;
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
  setupPresets(modal, snapshot, {
    apply: (preset, config) => {
      pages = presetPages(config, snapshot, initialPages);
      hs = snapshot.highlights.filter((item) => pages.some((page) => page.id === item.pageId));
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
    changed: presetsChanged,
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
