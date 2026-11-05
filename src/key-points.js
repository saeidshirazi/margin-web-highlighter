const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });
const words = new Intl.Segmenter(undefined, { granularity: 'word' });
const terms = (text) =>
  [...words.segment(text.toLowerCase())]
    .filter((word) => word.isWordLike)
    .map((word) => word.segment);

export function keyPoints(text) {
  const source = text.trim().slice(0, 24000);
  const candidates = [];
  const seen = new Set();
  const frequencies = new Map();
  for (const paragraph of source.split(/\n+/u)) {
    for (const { segment } of sentences.segment(paragraph)) {
      const sentence = segment.trim();
      const normalized = sentence.toLowerCase();
      if (!sentence || seen.has(normalized)) continue;
      seen.add(normalized);
      const tokens = [...new Set(terms(sentence))];
      for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
      candidates.push({ sentence, tokens, index: candidates.length });
    }
  }
  return candidates
    .map(({ sentence, tokens, index }) => ({
      sentence,
      index,
      score:
        tokens.reduce((sum, token) => {
          const count = frequencies.get(token);
          return sum + (count < candidates.length * 0.8 ? Math.log(count) : 0);
        }, 0) /
          Math.max(1, tokens.length) +
        Math.min(tokens.length, 12) / 60 +
        0.25 / (1 + index),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => a.index - b.index)
    .map(({ sentence }) =>
      sentence.length > 400 ? sentence.slice(0, 399).trimEnd() + '…' : sentence,
    );
}

export function explanationSource(page, highlight) {
  const quote = highlight.text.slice(0, 8000);
  const text = page.text || '';
  const start = highlight.anchor?.start;
  const savedPosition =
    Number.isInteger(start) && start >= 0 && text.startsWith(highlight.text, start);
  const first = text.indexOf(highlight.text);
  // If a phrase appears twice and its offset cannot be verified, use the context
  // captured with the highlight instead of guessing which occurrence was selected.
  const at = savedPosition
    ? start
    : first >= 0 && text.indexOf(highlight.text, first + 1) < 0
      ? first
      : -1;
  const context =
    at >= 0
      ? text.slice(Math.max(0, at - 1000), at + quote.length + 1000)
      : [highlight.anchor?.prefix, quote, highlight.anchor?.suffix].filter(Boolean).join(' ');
  return JSON.stringify({ quote, context });
}
