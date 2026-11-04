# Optional Google Drive sync

**Public release packages are ready for local use and deliberately omit maintainer OAuth registration.** You do not need this setup for highlights, notes, recording, PDFs, exports, or backups. To enable optional sync, configure your own build using the steps below. The maintainer’s existing Google registration remains in testing mode and is not a public one-click sync service. `npm run package:public` excludes all local OAuth configuration and preserves your configured build folders.

Version 0.6 adds separate web OAuth for Edge, Brave, and Firefox. See [CROSS-BROWSER.md](CROSS-BROWSER.md) for native callback registration, optional Firefox consent, installation and test limits. Chrome’s extension OAuth client is only for Chrome. Public clients need no embedded secret. The configured local packages remain in Google test mode; the user confirmed successful live Google sign-in and “Your library is synced” in both Edge and Firefox on November 4, 2026.

Google Drive sync is optional. Your existing library stays in IndexedDB and continues to work offline. Connect from **Settings & backups → Google Drive sync** after reading the consent. Highlights, notes, tags, collections, bookmarks, saved article text/HTML, transcripts, PDFs, recorded/imported audio, flashcards, review progress, and all library preferences are included. Browser-managed microphone permissions, keyboard shortcuts, downloaded AI models, temporary drafts, and API/OAuth tokens are not research records and are not synchronized.

## One-time Google sign-in setup

The source tree and default development ZIP do not contain a registered OAuth client. Continue with Google explains the missing registration and opens the one-time app setup section. A Google Chrome Extension OAuth client must be registered for the actual extension ID. No shared client secret or developer access token belongs in an extension.

1. Export a full JSON backup of your current library. Keep the same installation and folder while updating; do not uninstall it.
2. Reload Margin at `chrome://extensions`, refresh the library, and copy the extension ID shown in the Google Drive setup section.
   If Google Cloud shows **Google Cloud access blocked**, enable 2-step verification for your Google account using the button on that page. This is an account-owner action; Margin cannot enable it for you. Return to Cloud after verification is enabled.

3. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable the Google Drive API.
4. Configure Google Auth Platform branding, audience, and data access. Use only `https://www.googleapis.com/auth/drive.appdata`. If the project is in testing, add the Google accounts that will test it as test users. Organization policies and Google's current publication/verification requirements apply.
5. Create an OAuth client with application type **Chrome Extension**, using the exact extension ID as the application/item ID. Copy its client ID, not a secret.
6. From the project folder run:

   ```powershell
   npm run configure:google -- --client-id YOUR_CLIENT_ID.apps.googleusercontent.com
   ```

   This writes the public client ID to ignored `google-oauth.local.json` and rebuilds all browser targets. The configuration helper preserves an existing `extensionKey`. For CI/release builds, `MARGIN_GOOGLE_CLIENT_ID` overrides the local client ID.

7. Reload the same extension, refresh the library, and use **Continue with Google**. Chrome presents Google's sign-in/consent flow. Margin requests host access to `https://www.googleapis.com/*` and OAuth access only to its own app-data folder.

The [Chrome OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth) describes registering an extension and its client. The [Drive app-data guide](https://developers.google.com/workspace/drive/api/guides/appdata) explains the restricted folder and scope.

## Consistent IDs on other computers and publication

Chrome Web Store installations of the same item share an extension ID. For unpacked development copies, an extension ID can change with its path unless a manifest public key fixes it. Follow [Chrome's stable-ID instructions](https://developer.chrome.com/docs/extensions/reference/manifest/key): upload a draft ZIP to the developer dashboard without publishing, retrieve the item's public key, and add that public key as `extensionKey` in `google-oauth.local.json`. Build with a Chrome Extension OAuth client registered for that resulting ID. Do not put a private signing key in the repository or extension.

Adding/changing a manifest key can create a different installation identity. It does not automatically move an existing local database: export a backup first, confirm the new installation, and import the backup there. Keep the old installation until you verify the data. Configure all distributed builds for the same Google project/app and stable extension ID. Do not copy an entire Chrome profile or the internal sync journal to create another device; each installation needs its own generated replica identity.

For a published, configured release, ordinary users only click Connect and sign in; they do not configure Google Cloud. Before publication, test real sign-in with allowed test accounts, then confirm upload/download in two Chrome profiles using that registered client. These live authenticated steps have not been performed by the automated fixtures.

## Everyday use

- **Sync now** merges remote and local records immediately. It can be used while automatic sync is paused.
- **Pause automatic sync** keeps the local library and Drive copy. **Resume** merges changes and restarts the schedule.
- Automatic sync is scheduled roughly 30 seconds after a change and every 5 minutes while Chrome is running. Chrome may delay alarms. Local changes made offline remain available and retry on subsequent scheduled/manual syncs. Chrome must be open for background sync.
- **Disconnect** stops automatic sync and clears Margin's cached Google tokens. It keeps local data, the Drive copy, and the account binding. It does not revoke Google's authorization or delete cloud files. Manage/revoke access through your Google account; delete app data through Drive settings if desired. Disconnect before deleting remote app data so a running installation does not upload it again.
- A library stays bound to its first connected Google account to prevent uploading one account's research to another account accidentally. To use another Google account, use a separate Chrome profile/library.
- Drive sync files live in Google's hidden application-data folder, so they are not visible as ordinary files in My Drive. Download a normal JSON backup from Margin whenever you want a portable copy.

## Conflicts and deletions

Each installation writes its own replica file rather than overwriting another device's file. Per-record logical clocks track causal edits and retained deletion markers. This avoids depending on computer wall-clock times. Pages match by canonical URL, so independently saving the same source on two devices merges into one page while retaining distinct highlights. Existing local page IDs are preserved, including PDF and audio references.

Causally newer changes replace older ones. Concurrent edits choose a deterministic winner and retain the other value in **Download recovery copies**. A concurrent deletion wins over an edit, with the edited version retained for recovery. Source deletion also removes attachments and annotations; concurrently added children are retained in recovery rather than returning to the library. Recreating a deleted source does not automatically restore its deleted highlights.

Recovery downloads are JSON, not automatic restore backups. Each entry includes the record key (type and source/ID) and original `value`, such as `note`, `question`, or attachment `base64`. Copy useful text back into an editor or recover attachment bytes with an appropriate tool. There is no automatic conflict-resolution editor in this release. Recovery copies and tombstones are retained; there is no age-based cleanup that could resurrect records on a long-offline device. These copies may contain deleted text or attachments. A sync service is not a replacement for independent versioned backups.

## Storage, security, and limits

Google receives the full research payload only after you connect and consent. Margin has no application server, telemetry, or subscription. Chrome manages OAuth tokens in its identity cache; Margin never saves tokens/client secrets in IndexedDB, backup files, or sync payloads. Account display/binding and sync status are local preferences outside research exports. A 401 response invalidates the cached token and retries once; background work never initiates interactive sign-in.

Sync uses HTTPS and your Google account's access controls. Margin does not add end-to-end/password encryption to Drive sync files. Google storage/quota/policies apply. The app-data scope cannot list unrelated user Drive documents. The extension uses authenticated requests only to `www.googleapis.com` and refuses unexpected resumable-upload hosts.

Each device's converged replica includes the full research state, retained deletions, and recovery copies. Its file can be at most **256 MB**, measured as UTF-8 JSON, including base64 attachments. Each connected device keeps its own full replica, so multiple devices consume additional Drive quota. A local IndexedDB journal also retains the sync state for offline comparison and recovery. Large archives may need a future incremental/blob-separated sync design. Oversized or invalid remote files stop sync with a visible error rather than dropping records or partially applying a download. Existing local data stays usable.

Uploads use resumable sessions with 4 MB chunks. If interrupted, a later sync starts a new session from the current local journal; it does not resume an old session after a worker restart. Downloads are validated before an atomic data/journal transaction. User mutations run through the background queue; sync rechecks edits made during downloads before applying remote records. Large PDF/backup transfers are staged in IndexedDB to avoid Chrome's message-size limit.

## Verification

`npm run check` covers merge convergence, conflicts, stale devices/deletions, duplicate page URLs, preference restore, payload validation, atomic database application, token refresh, app-data scoping/pagination, resumable chunks, network failure, and account isolation. `npm run test:drive` installs two isolated Chromium extension profiles and exercises the real UI, service workers and IndexedDB against a local OAuth/Drive fixture. It does not access a real Google account. `npm run test:e2e` and `npm run test:native` cover the existing annotation/export/audio workflows.
