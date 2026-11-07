import { addSavedSearch, listSavedSearches, removeSavedSearch } from './db.js';
import { relatedHighlights } from './related-highlights.js';
import { dialog, esc, toast } from './ui.js';

export function saveLibrarySearch(view, filters) {
  const search = { view, filters: { ...filters } };
  dialog({
    title: 'Save search',
    body: `<label class="field">Name<input name="name" required maxlength="80" value="${esc((filters.query || '').trim().slice(0, 80))}"></label><p class="muted small">Saves the current view, search text, filters, and sort order in this browser.</p>`,
    onSubmit: async (form) => {
      await addSavedSearch({ ...search, name: form.get('name') });
      toast('Search saved.');
    },
  });
}

export async function openSavedSearches(apply) {
  const searches = await listSavedSearches();
  if (!searches.length) {
    toast('No saved searches yet. Use Save search to save this view.');
    return;
  }
  const modal = dialog({
    title: 'Saved searches',
    submit: 'Open search',
    body: `<label class="field">Search<select name="search">${searches.map(({ id, name }) => `<option value="${esc(id)}">${esc(name)}</option>`).join('')}</select></label><button type="button" data-remove-search>Remove selected search</button><p role="status" class="muted small" data-search-status></p>`,
    onSubmit: (form) => {
      const search = searches.find(({ id }) => id === form.get('search'));
      if (search) apply(search);
    },
  });
  const select = modal.querySelector('select');
  const remove = modal.querySelector('[data-remove-search]');
  const open = modal.querySelector('[type=submit]');
  remove.onclick = async () => {
    const option = select.selectedOptions[0];
    select.disabled = remove.disabled = open.disabled = true;
    try {
      await removeSavedSearch(option.value);
      option.remove();
      modal.querySelector('[data-search-status]').textContent = select.options.length
        ? 'Search removed.'
        : 'No saved searches left.';
    } catch (error) {
      toast(error.message);
    } finally {
      select.disabled = remove.disabled = open.disabled = !select.options.length;
    }
  };
}

export function showRelatedHighlights(item, state, open) {
  const matches = relatedHighlights(item, state.pages, state.highlights);
  const modal = dialog({
    title: 'Related highlights',
    body: matches.length
      ? `<p class="muted small">Matches from your library based on shared tags and words in quotes and notes.</p><ul>${matches
          .map(({ page, highlight, tags, words }, index) => {
            const quote = highlight.text.slice(0, 220) + (highlight.text.length > 220 ? '…' : '');
            const reason = tags.length
              ? 'Shared tags: ' + tags.join(', ')
              : 'Shared words: ' + words.join(', ');
            return `<li><p><strong>${esc(page.title)}</strong><br><span dir="auto">${esc(quote)}</span><br><span class="muted small">${esc(reason)}</span></p><button type="button" data-related-result="${index}">Open highlight</button></li>`;
          })
          .join('')}</ul>`
      : '<p>No related highlights found. Matches appear when quotes or notes share distinctive words, or highlights share a tag.</p>',
    submit: 'Done',
    onSubmit: () => {},
  });
  modal.querySelector('.modal-foot [data-close]').hidden = true;
  for (const button of modal.querySelectorAll('[data-related-result]')) {
    button.onclick = async () => {
      const { page, highlight } = matches[Number(button.dataset.relatedResult)];
      modal.close();
      try {
        await open(page, { kind: 'highlight', highlightId: highlight.id });
      } catch (error) {
        toast(error.message);
      }
    };
  }
}
