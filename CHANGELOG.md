# Changelog

## 0.8.0 — November 4, 2026

- Added nested collection navigation, implicit parents, subtree counts, deep links, arrow-key expansion and keyboard management.
- Added atomic branch rename/move and bulk source moves, source/folder drag-and-drop, safe unfiling, and guarded undo that preserves later edits. Existing destinations are not silently merged and cycles are rejected.
- Added up to 20 local export presets for explicit view/all/collection scopes. Research downloads, rich copy and print can be preset; credentials and full-backup passwords cannot. Local branch operations update preset paths.
- Full version-2 JSON backups include optional preset metadata and merge it repeat-safely. Drive wire format and research compatibility are unchanged; each device keeps its own presets.
- Added 7 organization tests (69 total), native browser coverage for hierarchy, drag, keyboard, scope/privacy and rollback, plus Firefox native preset-export coverage. No new extension permissions or dependencies.

## 0.7.0 — November 4, 2026

- Added quiet, configurable device-only backup reminders, last-download status, seven-day snooze, and reminder opt-out. Full JSON/encrypted downloads acknowledge a conservative revision so concurrent edits remain pending; failed download requests are not acknowledged.
- Added highlight location repair on websites and saved articles, explicit old/new confirmation, keyboard cancellation, stale-edit rejection, original quotation/history retention, and preservation of linked notes/cards/audio. PDF repair is not included.
- Added a dismissible/replayable first-use checklist and an offline practice page with real annotations. No account, permissions, telemetry, or storage schema changes.
- Device experience metadata is excluded from backups and Drive replicas. Existing version-2 research backups remain compatible.
- Added unit and native-browser coverage for reminders, failed exports, concurrency, practice/replay, repair cancellation and persistence.

## 0.6.0 — November 4, 2026

First public source snapshot of the final Margin implementation.

- Web/PDF highlights, custom palettes, Markdown notes, bookmarks, tags, collections and searchable research library.
- Offline reader, native browser sidebars, a responsive collapsible/resizable details workspace and accessible themes.
- Native voice recording and attachments, quick notes, supported dictation, read aloud, translation with language defaults and Persian/RTL handling.
- Markdown import, Notion/Markdown/AI-agent exports, HTML/CSV/print, annotated PDFs, full/encrypted backups and safe restore.
- Flashcards, spaced review, visible YouTube transcript capture and optional on-device AI controls.
- Optional Google Drive sync implementation with deletion tracking, conflict recovery, account isolation and separate browser OAuth paths. Public packages omit maintainer registration and work locally without setup.
- Separate Chrome, Edge, Brave and Firefox packages. Firefox is unsigned/temporary until Mozilla signing.
- 58 passing unit tests, browser regression suites, native synthetic-audio checks and cross-browser sync fixtures. See [validation and limits](CROSS-BROWSER.md).
- Browser-specific installation tutorials, screenshots, feature guide, contribution/security policies, issue forms and clean public release packaging.

Earlier private development snapshots are not included in this repository’s initial history.
