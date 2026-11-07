import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Notes and rich clipboard output should never load embedded media or submit forms.
export function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text || ''), {
    USE_PROFILES: { html: true },
    ALLOW_DATA_ATTR: false,
    SANITIZE_NAMED_PROPS: true,
    FORBID_TAGS: [
      'img',
      'iframe',
      'video',
      'audio',
      'source',
      'style',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'option',
    ],
    FORBID_ATTR: ['style', 'src', 'srcset', 'poster', 'ping', 'background'],
  });
}
