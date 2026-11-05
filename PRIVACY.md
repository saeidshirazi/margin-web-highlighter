# Margin privacy policy

Effective date: November 5, 2026. Applies to version 0.8.1.

Chrome, Edge, Brave, and Firefox store research in their own extension databases. Official public Chrome, Edge, Brave and Firefox packages use browser-managed web OAuth with a verified random state and exact callback; access tokens are cached only in extension session storage until expiry. Legacy configured Chrome development builds can still use Chrome’s native Google token service. Public OAuth client IDs and public identity keys are intentionally published; they grant no account access without Google consent. No client secret is included. Firefox requests optional website-content, browsing-activity, and identifying-information transmission consent for Drive/in-app Google translation; voice recordings fall within identifying information. No optional transmission is required for local research. See [CROSS-BROWSER.md](CROSS-BROWSER.md) for API differences and installation.

## Collection organization and saved export presets

Collections remain labels on saved source records. Rename, move and removal update only those labels and timestamps; linked research IDs and attachments are preserved. Undo is held in the library tab for the last organization operation and is unavailable after reloading. Library collection links include the chosen collection path in the extension URL. Collection labels synchronize as part of ordinary research records when Drive is configured.

Export presets store only an ID, name, research format, scope, collection path and metadata/source-text choices. They are kept in a separate local settings record, included in full JSON backups, and merged on import. They are excluded from Google Drive replicas and from research exports. No preset contains a password, API key, token, destination account or automatic online upload. A one-click preset performs the same user-initiated local download/clipboard/print action as the export center.

## Reminders, first-use guidance, and highlight repair

Backup reminder preferences, local change counters, last full-backup download time, snooze date and guide progress are stored in a separate device-only settings record. They are excluded from research backups and Google Drive sync. The browser can report that a download was requested, not that you kept the resulting file. The practice page is bundled locally and saves an ordinary practice source only after an explicit highlight action. No telemetry or notification permission is added.

Repair replaces the location and current quotation of an existing highlight after confirmation. Its notes, tags, cards and audio remain linked. The first quotation and up to 10 previous locations are retained in its research record, full backups and configured Drive sync. Those historical quotations may include text no longer visible on the original page. Deleting a highlight removes its local repair history; existing backups, sync replicas and recovery copies follow their usual retention/deletion rules.

## Optional Google Drive sync

Research remains local by default. When you explicitly consent and connect Google Drive in Settings, Margin sends your full saved library to Google's Drive API at `https://www.googleapis.com`: URLs, titles, text/HTML, highlights, notes, tags, collections, bookmarks, transcripts, PDFs, audio attachments, flashcards/review progress, and library preferences. Other connected installations signed in to that Google account download and merge that data. Deletions synchronize. Temporary editor drafts, browser permissions, downloaded AI models and credentials are not included.

Margin requests only the OAuth `drive.appdata` scope, which accesses Margin's hidden app-data folder rather than unrelated Drive files. The browser handles Google sign-in; token caching differs as described above. Margin does not put tokens or client secrets in its database, exports, or sync files. The public OAuth client ID is build configuration, not a secret. Account name/email, an account binding, sync state and last-sync time are stored locally for display and account isolation. Margin does not run an account or sync server.

Each device retains an offline sync journal and uploads a full replica with deletion markers and conflicting-edit recovery copies. Those copies can retain deleted text/attachments. Recovery downloads contain those research values. Sync files are not password/end-to-end encrypted by Margin; Google's access controls and storage policies apply. Each replica has a 256 MB JSON limit and consumes Drive quota; multiple devices retain separate copies. The extension does not charge a sync fee.

Automatic sync runs approximately 30 seconds after changes and every 5 minutes while the browser runs; offline or failed changes retry later. Pausing stops automatic sync. Disconnecting stops sync and clears cached Google tokens but keeps local research, the journal/account binding, and cloud files. It does not revoke Google authorization. Manage authorization in your Google account, and remove app data in Drive settings if desired. Disconnect before removing cloud files to prevent re-upload. A different Google account requires a separate browser profile to prevent accidental mixing. Independent exported backups must be deleted separately.

## Audio recording and quick notes

An explicit **Record voice** action requests microphone access and records locally using MediaRecorder. Unlike dictation, this creates an audio attachment. Margin stores the audio bytes in its extension IndexedDB database when you save the note, and includes them in JSON backups. Imported audio files are also stored locally. Audio recording/upload does not send the file to a transcription service. Recording stops after 5 minutes or the 20 MB limit; you can stop it earlier. The microphone stream is released on stop, error, editor close, or page teardown. While the stable capture tab remains open, recording can continue while you switch to the original source tab; Chrome's microphone indicator remains relevant.

Saved audio can be played, downloaded, or deleted. Deleting a page deletes its audio. Recordings already exported in backups/downloads must be removed separately if desired. Binary audio is excluded from Markdown, HTML, Notion, and agent research exports.

The default translation workflow is an explicit Google Translate website handoff. Its text is included in the URL and can enter browser history. Pasting the result back saves it locally. This replaces the misleading assumption that local Persian translation was available. Optional in-app Google Cloud/local translation and online speech retain their explicit provider/permission requirements.

Read-aloud uses installed browser/system voices. Online voices are hidden unless you allow them, and those providers' audio/text-processing policies apply when selected. Core highlighting, quick typed notes, and local recording do not require an account or API key.

## Optional speech and translation

Dictation uses Chrome's SpeechRecognition API only after you start it. Local mode requests `processLocally` and does not silently fall back to a remote service. Downloading a speech language pack is a separate user action. Browser-service mode requires explicit audio-processing consent and may send audio to Chrome's speech provider. Chrome handles microphone permission and speech processing. Dictation inserts confirmed text into your note; the separate Record voice action explicitly creates an audio attachment. Closing the editor aborts recognition.

Local translation uses Chrome's Translator and LanguageDetector APIs with browser-managed models. In **Google Cloud Translation** mode, after text-sharing consent and host permission, Margin posts only the text visible in the translation window plus source/target language settings to `https://translation.googleapis.com/language/translate/v2`. Your own API key is required. It is sent in a header, not the request URL. If you choose to remember it, it is stored in `chrome.storage.session` for the current browser session, not IndexedDB, exports, or backups. The key can be removed in Settings. Google Cloud's account, billing, and data policies apply.

The **Open Google Translate** button opens Google's website with the displayed text and language choices in its URL. This sends that text to Google on navigation and can leave the URL in browser history. It is an explicit external handoff, not private local translation.

The optional Google API host grant uses the existing optional HTTPS host-permission mechanism. The extension adds no blanket microphone permission; Chrome's speech/microphone access is requested when dictation starts. Default target/spoken languages and details-panel width are stored locally as preferences.

Markdown imports store the text you select or paste as a local document. A SHA-256 content fingerprint identifies unchanged imports; the fingerprint stays on your device. Notion exports and AI-agent bundles are local file or clipboard operations, not automatic uploads. They include the selected documents' notes and annotations; agent manifests also contain quote anchors with surrounding context. Including full saved source text is an explicit export option. Once you paste or import an export into another service or agent, that destination controls its copy of the data.

Margin has no account service, telemetry, advertising SDK, subscription service, or developer-operated remote database. It does not sell research data. Optional sync sends research to the Google account you connect, as described above.

## What is stored

When you highlight or save a page, Margin stores its URL, title, selected quotations, anchor context, colors, notes, tags, collection, and timestamps. Saving an offline article also stores extracted article text and sanitized HTML. Saving a transcript stores the visible transcript segments. Importing a PDF stores a local copy of its bytes. Flashcards and settings remain local as well.

Research lives in IndexedDB under the extension's own origin in your browser profile, alongside an offline journal when sync is used. `chrome.storage.local` contains change notifications and Google Drive account/sync status. Print exports temporarily use `chrome.storage.session` until the print view reads them. Chrome permissions configuration and shortcuts are managed by Chrome. Margin does not use `chrome.storage.sync`; optional Google Drive sync is a separate, consented feature.

## Access to websites

The content script runs on ordinary HTTP/HTTPS pages to offer highlighting and restore saved annotations. Merely visiting a page does not add it to the research library. Data is saved when you highlight, bookmark, or explicitly capture a page. Margin periodically checks the current page address to handle single-page navigation. Pausing a site removes its annotation controls and highlights until resumed.

Saved articles are sanitized and omit remote images and scripts. The library does not request site favicons, remote cover images, web fonts, analytics, or third-party CSS. External links open the original website only when used.

## Optional network operations

A remote PDF is downloaded only when you supply its URL and approve access to that site. Fetches omit credentials. A local PDF upload needs no network. Chrome may download or update its own on-device AI model under Chrome's policies; Margin sends source content to local browser APIs, not a cloud AI endpoint. AI functionality has no fallback to remote inference.

YouTube videos remain on the original YouTube website. Capturing an already-visible transcript does not call a transcript API. Seeking/following an existing video uses extension messages to that tab. Opening the original video makes the normal request to YouTube; its own privacy policy applies.

## Backups and deletion

JSON backups contain your research, including source URLs and PDF attachments. Exports are plaintext unless you choose password-encrypted JSON. Local IndexedDB data itself is not encrypted by Margin; protect your device and Chrome profile. The encryption password is used in memory and is never saved. There is no password recovery service.

Delete individual highlights, cards, or pages in the library. Deleting a page removes its annotations, linked flashcards, and stored PDF attachment in one transaction. Uninstalling the extension removes its local database. Keep a backup before uninstalling. Copies exported to files must be deleted separately if desired.

## Permissions

| Permission                               | Purpose                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `storage`                                | Local change notifications between extension views and temporary print exports                                |
| `unlimitedStorage`                       | Local article/PDF storage beyond the ordinary small quota; subject to device space                            |
| `contextMenus`                           | Highlight selected text and bookmark from the right-click menu                                                |
| `activeTab`                              | Access the page on which the extension action is invoked                                                      |
| `sidePanel`                              | Show a page's highlights beside the site                                                                      |
| `identity`                               | Google OAuth sign-in and cached tokens for optional Drive sync                                                |
| `alarms`                                 | Schedule pending/periodic Drive synchronization while Chrome runs                                             |
| HTTP/HTTPS/file content-script matches   | Display the selection toolbar and restore highlights on pages; file access is controlled separately by Chrome |
| Optional per-site HTTP/HTTPS host access | Requested remote PDF downloads, explicit Google Cloud translation, or consented Google Drive API requests     |

There are no `history`, `cookies`, `webRequest`, or broad `tabs` permissions. The extension does not read browsing history. A future maintainer can publish this policy with their release and provide contact information through the repository's issue/security reporting channels.
