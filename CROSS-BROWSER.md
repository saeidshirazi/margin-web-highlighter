# Chrome, Edge, Brave, and Firefox

Margin 0.8.1 has separate native browser builds. Research and JSON backups use the same format in all four. Export a backup before updating; see [Chrome identity migration](docs/INSTALL.md#update-without-losing-your-library) when moving from an older public Chrome build. Reload the original entry/folder for updates retaining the same ID. Uninstalling removes local data.

## Install

| Browser               | Folder / archive                                     | Steps                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chrome 150+           | `dist` / `margin-0.8.1-chrome.zip`                   | Extract to a stable folder. Open `chrome://extensions` → Developer mode → Load unpacked. Read the Chrome identity-migration guide before updating.                                   |
| Edge 150+             | `dist-edge` / `margin-0.8.1-edge.zip`                | Extract to a stable folder. Open `edge://extensions` → Developer mode → Load unpacked → select the extracted folder.                                                                 |
| Brave (Chromium 150+) | `dist-brave` / `margin-0.8.1-brave.zip`              | Extract to a stable folder. Open `brave://extensions` → Developer mode → Load unpacked → select the extracted folder.                                                                |
| Firefox 150+          | `dist-firefox` / `margin-0.8.1-firefox-unsigned.xpi` | For testing, open `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select the XPI or `dist-firefox/manifest.json`. Temporary installation ends when Firefox closes. |

**Permanent Firefox installation requires Mozilla signing.** This XPI is unsigned; it has not been uploaded or published. A maintainer can obtain an unlisted signed XPI before distribution, or publish on AMO. Do not disable signature checks. See [Mozilla signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

Reload website tabs after installing/updating, then pin Margin. Browsers protect settings, extension stores, and built-in PDF viewers from annotations; import PDFs into Margin instead. Some changed websites may require locating a quote manually; stored quotes remain in the library.

## Feature differences

| Feature                                                             | Chrome / Edge / Brave                                                                       | Firefox                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Highlights, notes, reader, PDFs, cards, search, backups and exports | Supported                                                                                   | Supported                                                                           |
| Native sidebar                                                      | `sidePanel`                                                                                 | `sidebarAction`                                                                     |
| Audio recording/playback                                            | Native MediaRecorder                                                                        | Native MediaRecorder; tested                                                        |
| Dictation                                                           | Requires exposed SpeechRecognition and supported language/service                           | API absent in tested Firefox; disabled with explanation; recording/typing available |
| Read aloud                                                          | Installed browser/system voices                                                             | Installed browser/system voices                                                     |
| Free translation website handoff and paste-back                     | Supported                                                                                   | Supported                                                                           |
| On-device translation / AI                                          | Feature-detected; browser/model/language dependent                                          | Absent in tested Firefox; no silent cloud fallback                                  |
| Optional Drive sign-in                                              | Official public builds use web OAuth; legacy configured Chrome can use its native token API | Web OAuth                                                                           |

Google Cloud Translation is an optional bring-your-own-key integration that may cost money. It is not required or enabled by this release. The default no-key website handoff avoids setting up that API. Core operation needs no paid service.

## Google sign-in

Official 0.8.1 public downloads include reviewed production web OAuth registration. Local research still needs no account. Historical live-sign-in confirmations below refer to the maintainer’s earlier configured builds; current fixture tests are labeled separately. See [Google Drive help](GOOGLE-DRIVE.md).

Configured packages use Settings & backups → Continue with Google → approve private Drive-folder access → wait for “Your library is synced.” Use the same account across browsers. The Google app is in production. Official 0.8.1 public builds include the reviewed web registration; independent local builds still need configuration.

Maintainers must use a separate Google **Web application** OAuth client for Edge, Brave, and Firefox, registering the exact native callback URLs displayed by Margin. Native Chrome’s OAuth client cannot be reused for the web flow. Official public Chrome uses web OAuth with the same stable public identity as Edge/Brave; configured native Chrome development registration stays supported. The Brave development build uses the same stable public key and native callback as Edge; local databases and tokens remain separate in each browser. Never include a web client secret in an extension. Public client configuration:

```sh
npm run configure:google -- --web-client-id YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

Alternatively set `MARGIN_GOOGLE_WEB_CLIENT_ID` for `npm run build:all`. Source archives exclude ignored local OAuth configuration and include only reviewed public registration. Independent local builds need their own registration. Keep browser IDs stable for updates; store distribution can change Chromium IDs and needs the actual release callback registered.

Firefox declares no required transmission. Connecting Drive or using in-app Google translation asks for optional website-content, browsing-activity, and identifying-information consent. Mozilla includes voice recordings in identifying information. Rejecting optional grants leaves local features available. See [Mozilla’s consent taxonomy](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Validation — November 4, 2026

Version 0.8 has 69 passing unit tests and dedicated Chromium/Edge/Brave organization tests: virtual parents, subtree counts, deep links, keyboard controls, branch/source drag, collision/cycle rejection, atomic moves, guarded undo, scoped presets and portable backup/import. Firefox passed its native hierarchy/keyboard-rename/preset-export check alongside the full regression suite. Presets stay local to each browser; existing Drive research records and version-2 backups remain compatible. No permissions or dependencies were added.

Version 0.7 adds 4 unit checks (62 total), real practice/replay flows, backup reminder/snooze/opt-out and failed-download checks, concurrent export accounting, and cancelable location repair with linked-data preservation. New workflows passed Chromium, Edge and Brave; Firefox passed its native practice-page and repair-preview/keyboard-confirmation checks. Reminder state stays device-local while repair history travels with the research records.

| Environment                                                           | Result                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                                                            | 69 passing: storage/migration, audio cleanup, language guards, exports, OAuth validation, sync merge/deletion behavior                                                                                                                                                    |
| Installed Edge 156.0.4314.58, isolated profiles                       | Main end-to-end suite, native audio suite and two-profile Drive fixture suite passed                                                                                                                                                                                      |
| Firefox 157.0, isolated Selenium profiles, temporary native add-on    | Highlight/reanchor, notes/search/organization, offline reader, cards, native audio recording/decoding/cleanup, translation handoff/paste-back, annotated PDF, agent ZIP, backup/deletion/restore, native sidebar and responsive UI passed; no extension JavaScript errors |
| Brave, installed binary 156.1.98.63 (Chromium 156), isolated profiles | Main end-to-end suite (16 groups), native MediaRecorder/backup suite, native sidebar/capability probe, and two-profile Drive fixture suite passed. `navigator.brave.isBrave()` confirmed the actual browser; no extension JavaScript errors.                              |
| Firefox ↔ Edge, three isolated profiles                               | Local OAuth/Drive fixtures: records/audio/preferences, round-trip changes, conflict recovery, deletions, pause/resume/disconnect passed                                                                                                                                   |
| Firefox web-ext validation                                            | Zero errors; 58 warnings for DOM construction and bundled PDF.js dynamic imports, reviewed and not suppressed                                                                                                                                                             |

On November 4, 2026, the user completed real Google sign-in in both Edge and Firefox and reported “Your library is synced” in each browser. This is user-confirmed live authorization and initial sync; conflict/deletion and cross-browser data checks used the isolated fixtures described above. Local fixtures do not certify Google’s real consent flow. Synthetic microphone input tests recording mechanics, not physical hardware or transcription accuracy. Translation tests verify the external URL and saving pasted text, not every language’s quality. Read-aloud voices and local models depend on the browser/OS. These checks do not guarantee every website works.

Live Google sign-in in Brave is pending user installation and approval. Brave’s speech and translation APIs were detected, but service/model availability and dictation accuracy were not certified; provider behavior was tested with fixtures. No Brave Shields settings were changed. [Brave documents Chromium extension support](https://brave.com/learn/using-chrome-extensions-in-brave/).

## Reproduce

Node 24+, `npm ci`, `npx playwright install chromium firefox`, then `npm run build:all`, `npm test`, `npm run lint`, `npm run test:firefox`, and `npm run test:firefox:drive`.

On Windows with Edge installed, set `MARGIN_TEST_BROWSER=edge` for `node tests/e2e.mjs`, `node tests/native-flows.mjs`, or `node tests/drive-e2e.mjs`. Use `MARGIN_TEST_BROWSER=brave` for the same suites with installed Brave. `MARGIN_BRAVE_BINARY` overrides its executable path. Leave unset for Chromium regression checks. `MARGIN_CROSS_CHROMIUM=chromium` runs the cross-engine fixture against Playwright Chromium instead of installed Edge (Linux CI). `npm run package` builds all browser archives and source. Tests use fresh profiles and synthetic data. The isolated Firefox test process explicitly enables Mozilla WebDriver system access for its own extension pages; user profiles are untouched.

Version 0.8.1 supplies production web OAuth in official public packages. Public Chrome has stable ID `hpffikaifcfoffjoihlbfgihoeofgdhm`; read the migration instructions before switching from an older path-derived Chrome installation. Public Chrome fixture tests exercise real isolated profiles with native OAuth disabled, verified callback identity and web-token/session behavior. Fixtures do not certify real Google authorization.

On November 5, 2026, the maintainer confirmed “Your library is synced” in the staged public Chrome 0.8.1 build using a Google account outside the former test list. This verifies real production authorization and initial sync for that browser/account. The cross-browser and conflict/deletion checks remain local transport fixtures.
