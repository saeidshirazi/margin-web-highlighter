import { marked } from 'marked';
import { SuggestionKind } from 'harper.js';

import { MAX_PROOFREAD_LENGTH } from './proofreading-limit.js';

function protectedRanges(text) {
  const ranges = [];
  let offset = 0;
  for (const token of marked.lexer(text)) {
    const start = text.indexOf(token.raw, offset);
    if (start === -1) continue;
    offset = start + token.raw.length;
    if (['blockquote', 'code'].includes(token.type)) ranges.push([start, offset]);
  }
  for (const match of text.matchAll(
    /(`+)[^\r\n]+?\1|"[^"\r\n]+"|“[^”\r\n]+”|https?:\/\/[^\s<>"\])]+|\bwww\.[^\s<>"\])]+|^\s*(?:[-+*]|\d+[.)])?\s*>.*$/gm,
  )) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  for (const line of text.matchAll(/[^\r\n]+/g)) {
    if (/[\p{L}--\p{Script=Latin}]/v.test(line[0]))
      ranges.push([line.index, line.index + line[0].length]);
  }
  return ranges;
}

export async function proofread(text, linter) {
  if (!text.trim() || text.length > MAX_PROOFREAD_LENGTH) return [];
  const ranges = protectedRanges(text);
  const lints = await linter.lint(text, { language: 'markdown', isolateEnglish: true });
  const issues = [];
  try {
    for (const lint of lints) {
      using span = lint.span();
      // The pinned JavaScript binding returns UTF-16 offsets, including after emoji.
      const { start, end } = span;
      if (start > end || end > text.length || ranges.some(([a, b]) => start < b && end >= a))
        continue;
      const suggestions = lint.suggestions();
      try {
        if (!suggestions.length) continue;
        const original = text.slice(start, end);
        const replacements = suggestions.slice(0, 3).map((suggestion) => {
          const replacement = suggestion.get_replacement_text();
          return suggestion.kind() === SuggestionKind.InsertAfter
            ? original + replacement
            : replacement;
        });
        issues.push({ start, end, message: lint.message(), original, replacements });
      } finally {
        suggestions.forEach((suggestion) => suggestion.free());
      }
    }
  } finally {
    lints.forEach((lint) => lint.free());
  }
  return issues.sort((a, b) => a.start - b.start);
}
