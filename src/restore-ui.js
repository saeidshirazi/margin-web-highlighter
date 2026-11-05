import { api } from './api.js';
import { decryptBackup } from './backup.js';
import { deleteSetting, importBackup, put } from './db.js';
import { dialog, esc, field, toast } from './ui.js';

function reportBody(report) {
  const rows = [
    ['Sources', report.sources.added, report.sources.merged, 0],
    ...['highlights', 'cards', 'attachments', 'presets'].map((key) => [
      key[0].toUpperCase() + key.slice(1),
      report[key].added,
      0,
      report[key].skipped,
    ]),
  ];
  return `<p>Existing sources keep their local details. New highlights, cards and attachments are added to matching sources. Duplicate records are skipped.</p>
    <table class="restore-table"><thead><tr><th scope="col">Records</th><th scope="col">Added</th><th scope="col">Merged</th><th scope="col">Skipped</th></tr></thead>
    <tbody>${rows
      .map(
        ([label, added, merged, skipped]) =>
          `<tr><th scope="row">${label}</th><td>${added}</td><td>${merged}</td><td>${skipped}</td></tr>`,
      )
      .join('')}</tbody></table>
    ${report.attention.total ? `<h3>Review ${report.attention.total} items</h3><ul>${report.attention.examples.map((example) => `<li>${esc(example)}</li>`).join('')}</ul>${report.attention.total > report.attention.examples.length ? '<p class="muted">Showing the first eight items.</p>' : ''}` : '<p>No differences need attention.</p>'}`;
}

function showPreview(data, report, refresh) {
  dialog({
    title: 'Review backup restore',
    submit: 'Restore backup',
    body: reportBody(report),
    onSubmit: async (_form, modal) => {
      const id = 'pending-import:' + crypto.randomUUID();
      await put('settings', { id, value: data });
      let result;
      try {
        result = await api('commit-import', { id, expected: report });
      } finally {
        await deleteSetting(id);
      }
      const showResult = () =>
        dialog({
          title: 'Restore complete',
          body: reportBody(result.report),
          submit: 'Done',
          onSubmit: () => {},
        });
      if (modal.open) modal.addEventListener('close', showResult, { once: true });
      else showResult();
      refresh().catch((error) => toast(error.message));
    },
  });
}

export function chooseBackup(refresh) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    try {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 300 * 1024 * 1024) throw new Error('Backup is too large (maximum 300 MB).');
      const data = JSON.parse(await file.text());
      if (data.format === 'margin-encrypted') {
        dialog({
          title: 'Unlock backup',
          body: field('Backup password', 'password', '', 'password'),
          submit: 'Unlock and preview',
          onSubmit: async (form, modal) => {
            const decoded = await decryptBackup(data, form.get('password'));
            const { report } = await importBackup(decoded, { preview: true });
            modal.addEventListener('close', () => showPreview(decoded, report, refresh), {
              once: true,
            });
          },
        });
      } else {
        const { report } = await importBackup(data, { preview: true });
        showPreview(data, report, refresh);
      }
    } catch (error) {
      toast(error.message);
    }
  };
  input.click();
}
