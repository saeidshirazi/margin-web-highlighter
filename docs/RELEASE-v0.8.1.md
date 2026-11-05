# Margin 0.8.1 — Google sign-in for public downloads

Official downloads now include the reviewed public Google web-client registration. Open **Settings & backups → Continue with Google** and approve Margin’s own hidden Drive folder. No Google Cloud project, command or API key is needed for official builds. Research remains on the device too; sync is optional.

The Google app is in production. Margin requests only `drive.appdata` and never embeds a client secret. Sync is not end-to-end encrypted by Margin and consumes your Google Drive quota. No paid service was enabled for this release.

## Updating safely

**Chrome users coming from public 0.8.0 or earlier must export a complete JSON backup before changing installations.** Public Chrome now uses stable ID `hpffikaifcfoffjoihlbfgihoeofgdhm` so Google can recognize its callback across computers and folders. Earlier public Chrome IDs depended on the installation path. Keep the old installation, load the new build, import the backup and verify your research before removing the old copy. Disable one copy while browsing to avoid duplicate annotation controls. Existing locally configured native Chrome installations are preserved.

Edge/Brave keep their existing stable public key. Firefox keeps its Gecko ID. For updates retaining an ID, replace files in the same folder, reload the same extension entry and refresh library/website tabs. Do not uninstall to update.

[Installation and migration guide](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#update-without-losing-your-library) · [Drive privacy and usage](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/GOOGLE-DRIVE.md)

## Download

- `margin-0.8.1-chrome.zip`
- `margin-0.8.1-edge.zip`
- `margin-0.8.1-brave.zip`
- `margin-0.8.1-firefox-unsigned.xpi`
- Matching source ZIP and SHA-256 checksums

The Firefox 0.8.0 marketplace submission is awaiting Mozilla review. This 0.8.1 GitHub XPI is a separate, unsigned build and still needs temporary installation; it has not been signed by Mozilla. Its public OAuth configuration will require a new Mozilla version submission before permanent installation is available.

## Validation

69 unit tests pass, including public Chrome web OAuth and legacy native-token behavior. Two isolated public Chrome profiles passed connect/sync/pause/resume/disconnect and data/conflict/deletion checks with local OAuth/Drive transport fixtures. Native Firefox regression and cross-engine Drive fixture tests passed. The maintainer also confirmed “Your library is synced” using a different Google account from the former test account in the staged public Chrome 0.8.1 build. This confirms real public authorization and initial sync in Chrome; other browser transport tests use fixtures.

This release also replaces a vague “Unknown request” message with instructions to reload Margin and refresh the tab after an update. No extension permissions or dependencies were added.
