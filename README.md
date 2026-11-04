<p align="center"><img src="brand/margin-icon.svg" width="88" alt="Margin logo"></p>
<h1 align="center">Margin</h1>
<p align="center"><strong>Keep what stays with you.</strong><br>Highlight the web. Collect ideas. Take your research anywhere.</p>
<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-245943"></a>
  <img alt="Version 0.6.0" src="https://img.shields.io/badge/version-0.6.0-245943">
  <img alt="Chrome, Edge, Brave and Firefox" src="https://img.shields.io/badge/browsers-Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave%20%C2%B7%20Firefox-245943">
</p>
<p align="center"><a href="#install">Install</a> · <a href="docs/GETTING-STARTED.md">First highlight</a> · <a href="FEATURES.md">Features</a> · <a href="docs/EXPORTS.md">Export your research</a> · <a href="PRIVACY.md">Privacy</a></p>

Margin is a free, open-source browser extension for highlights, notes, bookmarks, PDFs, and a searchable research library. Your data stays on your device by default. No account, subscription, or server is needed for everyday use.

![Margin library with highlighted sources and Markdown notes](docs/images/library.png)

## Install

**Download the file for your browser from [the latest release](https://github.com/saeidshirazi/margin-web-highlighter/releases/latest). No Node.js or coding is needed.** Desktop browsers only; Chromium 150+ or Firefox 150+.

| Browser         | Download                                                                                                                                    | Installation tutorial                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Google Chrome   | [Chrome ZIP](https://github.com/saeidshirazi/margin-web-highlighter/releases/latest/download/margin-0.6.0-chrome.zip)                       | [Chrome — five steps](docs/INSTALL.md#google-chrome)                |
| Microsoft Edge  | [Edge ZIP](https://github.com/saeidshirazi/margin-web-highlighter/releases/latest/download/margin-0.6.0-edge.zip)                           | [Edge — five steps](docs/INSTALL.md#microsoft-edge)                 |
| Brave           | [Brave ZIP](https://github.com/saeidshirazi/margin-web-highlighter/releases/latest/download/margin-0.6.0-brave.zip)                         | [Brave — five steps](docs/INSTALL.md#brave)                         |
| Mozilla Firefox | [Firefox XPI — unsigned](https://github.com/saeidshirazi/margin-web-highlighter/releases/latest/download/margin-0.6.0-firefox-unsigned.xpi) | [Firefox — temporary installation](docs/INSTALL.md#mozilla-firefox) |

For Chrome, Edge, or Brave: **extract the ZIP → open your browser’s extensions page → enable Developer mode → Load unpacked → select the extracted folder.** Then pin Margin and refresh your website tab.

Firefox currently loads as a **temporary add-on**, removed when Firefox closes. Permanent installation awaits Mozilla signing. The downloads are development/sideload builds, not browser-store listings. See the [installation guide](docs/INSTALL.md) for updates, permissions, and troubleshooting.

## Your first highlight

1. Open an ordinary article and select a sentence.
2. Choose a color from Margin’s toolbar.
3. Click the highlight to add a note or tag.
4. Open **Margin → Open your library** to find it again.
5. Choose **Export** when you want to take your research elsewhere.

That’s it. [Follow the getting-started guide](docs/GETTING-STARTED.md) for PDFs, voice notes, collections, and study cards.

## What you can do

- **Highlight your way:** custom colors, quick-highlight mode, keyboard shortcuts, and notes attached to quotes.
- **Find your ideas:** search source text, notes, and highlights; filter by color, tag, type, bookmark, or collection.
- **Read comfortably:** offline article copies, a native browser sidebar, adjustable reading settings, and light/dark/sepia/contrast themes.
- **Annotate PDFs:** local or remote PDFs, selectable text, notes, and export back to a standard annotated PDF.
- **Capture a thought:** quick typed notes, locally recorded audio, audio-file attachments, and read-aloud controls.
- **Move between tools:** Markdown, Notion-friendly files, structured AI-agent bundles, HTML, CSV, and print/PDF research digests. Import AI-generated Markdown too.
- **Remember what you read:** flashcards and spaced review, plus visible YouTube transcript capture and timestamp links.
- **Keep a recoverable copy:** complete JSON backups, optional password encryption, and repeat-safe restore.

[Full feature list and limits →](FEATURES.md)

<details>
<summary><strong>Translation, dictation, on-device AI, and optional sync</strong></summary>

- **Translation:** the free default opens Google Translate with your chosen text/languages. Paste the result back to save it beside your original note. It is a website handoff, not automatic in-app translation. Set a default target language, including Persian, and use automatic source detection. On-device translation depends on browser/model/language support. Google Cloud Translation is a separate optional integration using your own key and may incur charges; it is not required.
- **Dictation:** requires browser speech support and a compatible language/service. Firefox does not expose the required API in the tested version; typing and local voice recording remain available. Online processing requires explicit consent.
- **On-device AI:** summaries, questions, and flashcard drafts use supported local browser models. These features are optional and may be unavailable on your browser/hardware. There is no silent cloud fallback.
- **Google Drive:** optional full-library sync is implemented and has been verified with the maintainer’s account in Chrome, Edge, and Firefox. Public downloads contain no maintainer OAuth registration, so they work locally out of the box; sign-in needs your own registered build. The maintainer’s Google app is still in testing mode. [Drive setup and privacy](GOOGLE-DRIVE.md).

</details>

## Export without lock-in

| Destination                   | Choose in Margin                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Notion                        | **Copy for Notion**, or export a Notion Markdown ZIP and import it into Notion                |
| Obsidian or another notes app | Markdown files, optionally with YAML metadata                                                 |
| AI agents                     | Research ZIP with readable Markdown, source URLs, stable quote IDs, and a structured manifest |
| Spreadsheet                   | CSV                                                                                           |
| Share or print                | HTML or a print/PDF digest                                                                    |
| Restore everything            | Full JSON backup, optionally password-encrypted; includes PDF and audio attachments           |

Research exports use selected sources, or the filtered view if nothing is selected. Full backups always include the whole library. Binary PDF/audio files are included in backups, not Markdown/Notion/agent bundles. [Export tutorials →](docs/EXPORTS.md)

## Local first, by design

Core research stays in your browser’s extension database. Margin has no telemetry, advertising, developer-operated sync server, or remote fonts. Optional network actions are labeled: opening a source, remote PDF download, Google Translate, online speech, model downloads, and configured Google Drive sync.

**Back up regularly.** Uninstalling Margin or deleting its browser profile removes local data. Update by reloading the same extension entry; do not uninstall to update. [Privacy policy](PRIVACY.md) · [Permissions and troubleshooting](docs/INSTALL.md#permissions)

## Compatibility and testing

Tested in isolated desktop profiles: Chromium/Chrome regression environment, installed Edge and Brave (Chromium 156), and Firefox 157. The suite covers highlighting/reanchoring, notes, reader, PDFs and annotation exports, native audio recording with synthetic input, research exports, backup/restore, and sync fixtures. **58 unit tests pass.** Firefox ↔ Edge synchronization is also tested with local OAuth/Drive fixtures.

These checks do not certify every website, speech accuracy, every language/model, or Notion’s live importer. Browser-protected pages and scanned/image-only PDFs cannot be highlighted. [Browser differences and detailed validation](CROSS-BROWSER.md) · [Troubleshooting](docs/INSTALL.md#troubleshooting)

## Build and contribute

Using a download? Skip this section. For contributors, install Node.js 24+:

```sh
npm ci
npm run build:all
npm test
npm run lint
```

Load the relevant build folder: `dist`, `dist-edge`, `dist-brave`, or `dist-firefox`. To create clean public downloads without local OAuth configuration:

```sh
npm run package:public
```

See [Contributing](CONTRIBUTING.md) for browser tests, [Architecture](ARCHITECTURE.md) for the code, and [Security](SECURITY.md) for private vulnerability reports. Bug reports should include a browser version and a small public or synthetic example, never a private research backup.

## License

[MIT](LICENSE). Original Margin branding and an independent implementation. Bundled dependencies retain their licenses in each download’s `THIRD_PARTY_NOTICES.txt`.
