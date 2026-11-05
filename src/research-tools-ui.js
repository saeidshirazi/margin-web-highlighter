import { api } from './api.js';
import { localAI } from './ai.js';
import { explanationSource, keyPoints } from './key-points.js';
import { dialog, esc, toast } from './ui.js';

export function openResearchTool(kind, page, highlight, refresh) {
  const explain = kind === 'explain';
  const source = highlight?.text || page.text || page.note || '';
  if (!source.trim()) {
    toast('Save the article or add a note to use Key points.');
    return;
  }
  const title = explain ? 'Explain highlight' : 'Key points';
  const points = explain ? [] : keyPoints(source);
  const modal = dialog({
    title,
    submit: 'Save to note',
    body: `${highlight ? `<blockquote>${esc(highlight.text)}</blockquote>` : `<p><strong>${esc(page.title)}</strong></p>`}
      ${explain ? '<p class="muted">Uses a compatible on-device model. Review the explanation before saving.</p><button type="button" data-generate-explanation>Generate explanation</button><p role="status" data-explanation-status></p><div class="research-answer" data-explanation-result></div>' : `<p class="muted">Selected excerpts from the original text.${source.trim().length > 24000 ? ' Uses the first 24,000 characters.' : ''}</p><ul>${points.map((point) => `<li>${esc(point)}</li>`).join('')}</ul>`}`,
    onSubmit: async () => {
      if (!result) return false;
      await api('append-note', {
        pageId: page.id,
        highlightId: highlight?.id,
        text: `### ${title}\n\n${result}`,
      });
      refresh().catch((error) => toast(error.message));
      toast('Saved to note');
    },
  });
  let result = points.map((point) => '- ' + point).join('\n');
  if (!explain) return;
  const controller = new AbortController();
  modal.addEventListener('close', () => controller.abort(), { once: true });
  const save = modal.querySelector('[type=submit]');
  const generate = modal.querySelector('[data-generate-explanation]');
  const status = modal.querySelector('[data-explanation-status]');
  save.disabled = true;
  if (typeof globalThis.LanguageModel?.create !== 'function') {
    status.textContent =
      'The local explanation model is unavailable on this browser or device. Key points works offline.';
    generate.disabled = true;
    return;
  }
  generate.onclick = async () => {
    generate.disabled = true;
    save.disabled = true;
    result = '';
    const output = modal.querySelector('[data-explanation-result]');
    output.textContent = '';
    status.textContent = 'Preparing the local model…';
    try {
      result = (
        await localAI(
          'explain',
          explanationSource(page, highlight),
          '',
          (message) => {
            status.textContent = message;
          },
          controller.signal,
        )
      ).trim();
      if (!result) throw new Error('The model returned no explanation. Try again.');
      output.textContent = result;
      status.textContent = '';
      save.disabled = false;
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = error.message;
    } finally {
      generate.disabled = false;
    }
  };
}
