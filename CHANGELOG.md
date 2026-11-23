# Changelog

## 0.9.15

- Redesign on-device AI as a completely separate **AI Assistant** collapsible card below the note editor in the floating annotation box — no longer mixed with note formatting tools.
- AI results (Explain / Summarize) now appear in a dedicated read-only result area inside the AI card, with **Add to note** and **Copy** actions. AI output is never automatically inserted into the note textarea.
- Fix on-device AI availability check in the library Explain dialog to support both modern `window.ai.languageModel` and legacy `globalThis.LanguageModel` APIs — users on newer Chrome builds no longer see a false "unavailable" message.
- Keep **Auto-tags** button alongside the Tags field for quick tag generation.
- AI Assistant card is collapsed by default and expands on first use — click the ✦ AI Assistant header to toggle.

## 0.9.14

- Add on-device AI tools (Explain, TL;DR, and Auto-tags) directly inside the on-page floating annotation editor.
- Add an On-Device AI assistant to the browser side panel for 1-click page summaries and grounded Q&A with Markdown copy and save-to-note capabilities.
- Modernize local AI support for both modern `window.ai` namespaces (`languageModel` / `summarizer`) and legacy Prompt API globals.

## 0.9.13

- Add built-in voice-to-text dictation with a microphone icon in the on-page floating annotation editor, note modals, and the side panel quick note.
- Support live speech transcription with intelligent cursor insertion and active recording pulse indicator across all supported browsers.

## 0.9.12

- Bound native browser test shutdown after assertions finish, preserving failed test outcomes.
- Publish the unified browser and keyless Chrome packages with the verified test cleanup.

## 0.9.11

- Align all browser packages and both Chrome installation variants in one versioned release.
- Include the keyless Chrome upload ZIP in public release checksums while preserving fixed identities for unpacked installs.
- Produce reproducible archives across build timezone, file ordering and text line endings.

## 0.9.10

- Add a dedicated Chrome Web Store package that omits the conflicting development key.
- Keep fixed-ID unpacked Chrome, Edge and Brave builds unchanged.
- Validate store package identity, public OAuth configuration, version and archive contents before upload.

## 0.9.9

- Remember the last pronunciation voice chosen for each language.
- Use one fixed-width button that switches between Stop and Repeat.

## 0.9.8

- The pronunciation toolbar detects when playback finishes and offers Repeat with the selected voice.

## 0.9.7

- Preserve newer note drafts when an edit is reverted in another tab.
- Restore research from backups even when the export preset list is full, and report skipped presets.
- Clear GitHub update alerts when GitHub access is revoked.
- Prevent older PDF renders from updating the viewer after a zoom change.

## 0.9.6

- Save a named library search with its view, filters, and sort order, then run it again on the current library.
- Find related highlights by shared tags or words in quotes and notes. Each match shows why it appeared.

## 0.9.5

- Recover unsaved website annotation notes after closing the popup or reloading a page. Restore or discard the draft when you reopen the highlight.

## 0.9.4

- Added compact offline English proofreading to the annotation popup on websites.

## 0.9.3

- Added on-device English proofreading for library notes and Quick Note drafts. Review suggestions as you type, then apply or ignore them individually.

## 0.9.2

- Made PDF saves, settings patches, and study reviews atomic. Repeated undo keeps newer highlight edits.
- Unified Markdown sanitization and escaped record IDs in UI attributes.
- Enforced the PDF download limit while streaming, and fixed bookmark reloads and library search navigation.
- Split the export dialog into a focused module, updated architecture documentation, and organized local release archives by version.

## 0.9.1

- Added optional GitHub release alerts. Enable checks in **Settings & backups → Extension updates** to see a toolbar badge and release link when a newer version is available.

## 0.9.0

- Browse individual quotes and notes across sources in the new Highlights view. Search and combine filters, then open the matching annotation or PDF page.
- Copy a quote with its source title, web address when available, and PDF page number when known.

## 0.8.3

- Translate selections in Margin without an API key, with a local cache and optional LibreTranslate fallback.
- Pronounce selections with automatic language detection and US or UK English voices when available.
- Resume offline articles and PDFs, with optional reading-position sync through Google Drive.
- Jump to matching passages from library search and extract key points offline. Compatible on-device models can also explain a highlight.
- Preview plain or encrypted backup restores before merging.

## 0.8.1

- Enabled Google Drive sign-in in the public downloads.
- Gave the public Chrome build a stable extension ID. See the [migration steps](docs/INSTALL.md#update-without-losing-your-library) before updating an older installation.

## 0.8.0

- Added nested collections, bulk moves, and undo.
- Added saved Markdown, Notion, and research export presets.

## 0.7.0

- Added backup reminders, highlight repair, and a practice page.

## 0.6.0

- First public release for Chrome, Edge, Brave, and Firefox.

[GitHub releases](https://github.com/saeidshirazi/margin-web-highlighter/releases)
