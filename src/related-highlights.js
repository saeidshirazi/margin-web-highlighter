const commonWords = new Set(
  'about after again also because before being between could does during from have here into more most must only other over same should some such than that their them then there these they this those through under very were what when where which while will with would your'.split(
    ' ',
  ),
);

function terms(highlight) {
  const text = `${highlight.text}\n${highlight.note || ''}`.normalize('NFKC').toLowerCase();
  return new Set((text.match(/[\p{L}\p{M}]{4,}/gu) || []).filter((word) => !commonWords.has(word)));
}

export function relatedHighlights(item, pages, highlights) {
  const sources = new Map(pages.map((page) => [page.id, page]));
  const itemWords = terms(item);
  const itemTags = new Set(item.tags);
  const matches = [];
  for (const highlight of highlights) {
    const page = sources.get(highlight.pageId);
    if (!page || highlight.id === item.id) continue;
    const tags = highlight.tags.filter((tag) => itemTags.has(tag));
    const candidateWords = terms(highlight);
    const words = [...candidateWords].filter((word) => itemWords.has(word));
    if (!tags.length && words.length < 2) continue;
    const overlap = words.length / (Math.sqrt(itemWords.size * candidateWords.size) || 1);
    matches.push({ page, highlight, tags, words: words.slice(0, 3), overlap });
  }
  return matches
    .sort(
      (a, b) =>
        b.tags.length - a.tags.length ||
        b.overlap - a.overlap ||
        b.highlight.updatedAt - a.highlight.updatedAt,
    )
    .slice(0, 5);
}
