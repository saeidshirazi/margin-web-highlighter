# Features in Margin 0.6.0

[Install](docs/INSTALL.md) · [Getting started](docs/GETTING-STARTED.md) · [Browser compatibility and tests](CROSS-BROWSER.md)

## Capture and organize

| Feature           | What it does                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Web highlights    | Selection toolbar, right-click action, shortcuts, overlapping quotes, persistent quote/context anchors |
| Your colors       | Five defaults, custom picker, up to 12 palette entries, per-quote recoloring and color filters         |
| Quick mode        | Highlight each selection; number keys switch colors, Escape stops                                      |
| Notes             | Markdown notes on pages and highlights, standalone notes, source-linked quick capture                  |
| Library           | Grid/list views; full-text search; color/type/tag/bookmark/collection filters; sort and bulk actions   |
| Collections       | Searchable path-style names; currently displayed as a flat list                                        |
| Details workspace | Docked, collapsible, resizable; inline layout on narrow windows; reduced-motion support                |
| Browser sidebar   | Notes/highlights beside the original source, with an inline quick-note editor                          |

## Read, listen, and learn

| Feature            | What it does / limits                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Offline reading    | Sanitized article text/HTML, shared highlights, typography controls and five themes; omits site images/scripts/styles                    |
| PDFs               | Local/remote PDFs up to 50 MB, text highlighting/notes/tags, standard annotated-PDF export; no OCR or encrypted PDFs                     |
| Audio notes        | Native local recording, attachment import, preview/playback/download/delete; 5-minute / 20 MB recording limit, 20 MB import limit        |
| Dictation          | Confirmed speech text inserted at the cursor; local/browser-service choices where supported; no required API in tested Firefox           |
| Read aloud         | Installed voices, speed, pause/resume/stop; online voices require explicit opt-in                                                        |
| Translation        | Automatic source choice, default output language, Persian/RTL handling; free website handoff with paste-back, optional local/API engines |
| Flashcards         | Cards from quotes, answer reveal and spaced review; optional local AI drafts                                                             |
| YouTube transcript | Capture already-visible transcript, annotate offline, timestamp links and follow-video behavior; live markup may change                  |
| Local AI           | Browser-supported summaries/questions/cards; model, hardware, language and browser dependent; no silent cloud fallback                   |

## Keep control of your data

- Markdown, Notion-friendly exports, AI-agent ZIPs, HTML, CSV, print/PDF digests, and Markdown import.
- Complete JSON backup with PDF/audio attachments, optional password encryption, atomic merge/restore, and repeat-safe import.
- Local IndexedDB storage; no required account, telemetry, subscriptions, or application server.
- Optional registered Google Drive app-data sync: records, settings, attachments, study progress, deletion markers, account isolation and conflict recovery. Public packages omit OAuth registration. [Setup](GOOGLE-DRIVE.md).

## Compatibility and practical limits

Chrome, Edge and Brave use Chromium builds; Firefox has its own event-background/sidebar build. Firefox currently requires temporary installation until Mozilla signing. Native local recording works in all tested browsers; dictation and on-device models have browser-specific limitations.

Browser settings pages, extension stores, built-in PDF viewers, other extensions, canvas text, closed shadow DOM, cross-origin frames and editable fields are not supported annotation targets. Some changed websites require locating quotes manually. Quotes remain stored even if they cannot be reattached.

Core browser regression suites, native synthetic-audio tests, backup/restore, PDF export validation and sync fixtures passed. Chrome/Edge/Firefox live Google setup was confirmed by the maintainer; Brave’s live Google authorization is not explicitly confirmed. Notion’s live importer, actual speech accuracy, all local models and every website are not certified. Details: [CROSS-BROWSER.md](CROSS-BROWSER.md).
