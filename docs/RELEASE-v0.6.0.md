# Margin 0.6.0

The first public release of Margin: a free, local-first web highlighter and research library for Chrome, Edge, Brave, and Firefox.

## Download and install

No Node.js or account is needed for local use. Choose the asset for your browser:

| Browser | Asset                               | Tutorial                                                                                                                           |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Chrome  | `margin-0.6.0-chrome.zip`           | [Install in Chrome](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#google-chrome)                |
| Edge    | `margin-0.6.0-edge.zip`             | [Install in Edge](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#microsoft-edge)                 |
| Brave   | `margin-0.6.0-brave.zip`            | [Install in Brave](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#brave)                         |
| Firefox | `margin-0.6.0-firefox-unsigned.xpi` | [Temporary Firefox installation](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#mozilla-firefox) |

For Chromium browsers, extract the ZIP, open the extensions page, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. Pin Margin and refresh the article tab.

Firefox’s XPI is unsigned and loads temporarily through `about:debugging`. It is removed when Firefox closes; back up before ending your session. Permanent signing and browser-store listings are not included in this release.

## Included

Custom-color web/PDF highlights; Markdown notes, tags, collections and bookmarks; searchable library; offline reader and native sidebars; audio notes and supported speech tools; translation with language defaults; flashcards and transcript tools; Markdown import; Notion/Markdown/AI-agent exports; annotated PDF, HTML, CSV, print and complete/encrypted JSON backups.

[First-highlight tutorial](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/GETTING-STARTED.md) · [Feature guide](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/FEATURES.md) · [Export tutorials](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/EXPORTS.md)

## Before you start

- Public packages work locally and **omit maintainer Google OAuth registration**. Optional Drive sync needs your own configured build. The maintainer’s Google app is still in testing mode. [Setup](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/GOOGLE-DRIVE.md).
- Translation defaults to a free Google Translate website handoff with paste-back. In-app Google Cloud Translation is optional, requires your own key and may charge your project; it is not required.
- Dictation and on-device models depend on browser/OS/language/hardware; Firefox lacks the tested dictation API. Local voice recording remains available.
- Back up before updating. Reload the same extension entry instead of uninstalling it.

58 unit tests and isolated browser regression/native-audio/sync-fixture checks passed locally. Live Google sign-in and initial sync were confirmed by the maintainer in Chrome, Edge and Firefox; Brave’s live authorization is not explicitly confirmed. Coverage is not a guarantee for every website or model. [Full validation notes](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/CROSS-BROWSER.md).

The source snapshot and `SHA256SUMS.txt` are attached alongside the browser packages. MIT licensed; no subscriptions, telemetry or required backend.
