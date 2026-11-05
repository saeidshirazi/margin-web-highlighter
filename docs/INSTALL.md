# Install Margin

Choose your browser below. **You do not need Node.js, a terminal, or an account.**

Download a browser-specific file from [the latest release](https://github.com/saeidshirazi/margin-web-highlighter/releases/latest). Use the assets named `margin-0.8.1-…`, rather than GitHub’s automatic “Source code” downloads. Those source downloads require building first.

## Google Chrome

1. Download **margin-0.8.1-chrome.zip** and extract it to a folder you will keep, such as `Documents/Margin/Chrome`.
2. In Chrome’s address bar, type `chrome://extensions` and press Enter.
3. Turn on **Developer mode** at the top right.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`. Select the folder, not that file.
5. Open Chrome’s puzzle-piece **Extensions** menu, pin **Margin**, and refresh the website you want to highlight.

Click **Margin → Open your library**. Continue with [your first highlight](GETTING-STARTED.md).

## Microsoft Edge

1. Download **margin-0.8.1-edge.zip** and extract it to a permanent folder, such as `Documents/Margin/Edge`.
2. In Edge, open `edge://extensions`.
3. Turn on **Developer mode**. Its position may vary with the window size.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Pin **Margin** from Edge’s **Extensions** menu and refresh your website tab.

Click **Margin → Open your library**. Continue with [your first highlight](GETTING-STARTED.md).

## Brave

1. Download **margin-0.8.1-brave.zip** and extract it to a permanent folder, such as `Documents/Margin/Brave`.
2. In Brave, open `brave://extensions`.
3. Turn on **Developer mode** at the top right.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Pin **Margin** from the puzzle-piece **Extensions** menu and refresh your website tab.

On Windows, if the folder picker is confusing: click its address bar, paste the extracted folder’s path, press Enter, then click **Select Folder**. Click **Margin → Open your library** to start. Brave Shields do not need to be disabled for the tested core workflows.

## Mozilla Firefox

**This release is unsigned and temporarily installed. Firefox removes it when you close the browser.** Export a full JSON backup before ending your test session; do not rely on temporary-install storage surviving removal/reinstallation.

1. Download **margin-0.8.1-firefox-unsigned.xpi**. Keep it as an XPI; do not rename it to a ZIP.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select the downloaded XPI. If your OS/file picker does not offer it, extract a copy and select its `manifest.json` instead.
5. Open Firefox’s **Extensions** menu → **Margin** → **Open your library**, then refresh your article tab.

The normal Add-ons Manager rejects this unsigned XPI; use the temporary-add-on screen above. Permanent installation requires a Mozilla-signed package, which is not included yet. Do not disable Firefox’s signature checks. [Mozilla’s signing guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

Firefox supports local voice recording. Dictation and on-device AI/translation are unavailable when Firefox does not expose their required APIs; the interface explains this. See [browser differences](../CROSS-BROWSER.md).

## Update without losing your library

**Chrome 0.8.1 identity change:** earlier public Chrome builds used a path-derived ID. The new public build uses stable ID `hpffikaifcfoffjoihlbfgihoeofgdhm` for web sign-in. Export a full JSON backup from the old installation first. Keep it installed, load the new build separately, import the backup and verify research before removing the old copy. Disable one copy while browsing to avoid duplicate toolbars. Existing configured native Chrome installations are preserved; do not overwrite them to test this identity. Edge/Brave retain their public key, and Firefox retains its Gecko ID.

For updates retaining the same extension ID:

1. In Margin, choose **Export → Full JSON backup** and keep the file somewhere safe.
2. Close capture/recording tabs. Extract the new download over the **same browser-specific folder** you originally loaded. Keep the same extension entry.
3. On your extensions page, click **Reload** for Margin. Refresh open website tabs and the library.
4. Check a saved highlight before deleting the backup.

Do not uninstall Margin to update it. Browser stores are not used in this release, so unpacked downloads do not update automatically. To move between browsers, import a full JSON backup in the destination browser, or connect the same Google account using official configured public downloads.

## Permissions

| Request                              | Why Margin needs it                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Read/change ordinary websites        | Show the selection toolbar and restore your saved highlights. Visiting a page alone does not save it to the library. |
| Local extension storage              | Keep research, PDF/audio files, preferences, and backups locally.                                                    |
| Context menus / active tab / sidebar | Right-click highlighting, actions on the current source, and notes beside it.                                        |
| Identity / alarms                    | Optional registered Google Drive sign-in and scheduled sync. No sign-in is needed for local use.                     |
| Microphone                           | Asked only when you start recording or supported dictation; recording stops and releases tracks when stopped/closed. |
| Extra website access                 | Asked when downloading a remote PDF or enabling a configured online integration.                                     |

Firefox additionally asks for optional data-transmission consent for configured Drive/in-app Google translation. You can decline it and keep using local features. [Full privacy policy](../PRIVACY.md).

## Troubleshooting

| What happens                                 | Try this                                                                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Manifest file is missing”                   | Extract the ZIP first. Select the folder directly containing `manifest.json`, not its parent or GitHub’s source archive.                                                                      |
| The highlight toolbar does not appear        | Refresh the article after installation. Confirm Margin is enabled and the site is not paused. Try an ordinary HTML article; browser settings, stores, and built-in PDF viewers are protected. |
| A PDF cannot be highlighted                  | Open **Margin library → Add to library → PDF**. Scans need a text layer; OCR and password-protected PDFs are not supported.                                                                   |
| Firefox says the add-on is unsigned          | Use `about:debugging` for this temporary test build. Permanent signing is pending.                                                                                                            |
| A shortcut does nothing                      | Configure conflicts at `chrome://extensions/shortcuts`, `edge://extensions/shortcuts`, or `brave://extensions/shortcuts`. Firefox: `about:addons` → gear menu → Manage Extension Shortcuts.   |
| Microphone permission is denied              | Check the browser and OS microphone permissions. You can still attach an audio file or type a note.                                                                                           |
| Dictation/model is unavailable               | Record audio or type instead. Support depends on browser, language, OS, hardware, and installed models.                                                                                       |
| Translation opens another tab                | This is the default free workflow. Translate there, then paste the result back into Margin and save.                                                                                          |
| Google sign-in says setup is needed          | Use an official 0.8.1 download. Older public packages and unconfigured development builds need registration; see [Drive help](../GOOGLE-DRIVE.md).                                            |
| A quote cannot be found on its original page | The page may have changed. The saved quote remains in your library; check the offline copy if you captured it.                                                                                |

Still stuck? [Open a bug report](https://github.com/saeidshirazi/margin-web-highlighter/issues/new/choose) with your browser/version and a public example. Do not upload private notes, tokens, or research backups.
