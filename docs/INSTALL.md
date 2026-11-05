# Install Margin

Get your browser package from the [latest GitHub release](https://github.com/saeidshirazi/margin-web-highlighter/releases/latest). Use the browser ZIP or XPI under **Assets**. Install on a desktop browser with Chromium 150+ or Firefox 150+.

## Chrome, Edge, and Brave

1. Extract the ZIP for your browser into a folder you plan to keep.
2. Open the extensions page listed below and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Pin Margin from the Extensions menu, then refresh the page you want to highlight.

### Google Chrome

Download the asset ending in `-chrome.zip` and open `chrome://extensions`.

### Microsoft Edge

Download the asset ending in `-edge.zip` and open `edge://extensions`.

### Brave

Download the asset ending in `-brave.zip` and open `brave://extensions`.

## Mozilla Firefox

1. Download the asset ending in `-firefox-unsigned.xpi`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and select the XPI.
4. Open Margin from the Extensions menu and refresh your article tab.

Firefox unloads unsigned add-ons when it closes. Export a full backup before ending a temporary session.

[Make your first highlight](GETTING-STARTED.md)

## Update without losing your library

**Chrome 0.8.1 identity change:** earlier public Chrome builds used a path-derived ID. The new public build uses stable ID `hpffikaifcfoffjoihlbfgihoeofgdhm` for web sign-in. Export a full JSON backup from the old installation first. Keep it installed, load the new build separately, import the backup and verify research before removing the old copy. Disable one copy while browsing to avoid duplicate toolbars. Existing configured native Chrome installations are preserved; do not overwrite them to test this identity. Edge/Brave retain their public key, and Firefox retains its Gecko ID.

For updates retaining the same extension ID:

1. In Margin, choose **Export → Full JSON backup** and keep the file somewhere safe.
2. Close capture/recording tabs. Extract the new download over the **same browser-specific folder** you originally loaded. Keep the same extension entry.
3. On your extensions page, click **Reload** for Margin. Refresh open website tabs and the library.
4. Check a saved highlight before deleting the backup.

Do not uninstall Margin to update it. Unpacked downloads update manually. To move between browsers, import a full JSON backup in the destination browser, or connect the same Google account using official configured public downloads.

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
| Translation opens another tab                | Choose **Google Translate · free in Margin** to show the result in the dialog, or paste back a result from the website.                                                                       |
| Google sign-in says setup is needed          | Use a browser download from the latest GitHub release. Older public packages and unconfigured development builds need registration; see [Drive help](../GOOGLE-DRIVE.md).                     |
| A quote cannot be found on its original page | The page may have changed. The saved quote remains in your library; check the offline copy if you captured it.                                                                                |

Still stuck? [Open a bug report](https://github.com/saeidshirazi/margin-web-highlighter/issues/new/choose) with your browser/version and a public example. Do not upload private notes, tokens, or research backups.
