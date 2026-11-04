# Margin 0.7.0 — Keep your research safe and easy to find

This release adds three focused improvements, with no new permissions or account requirements.

## What’s new

- **Quiet backup reminders:** a library prompt after 7 days or 50 research changes, configurable time/change thresholds, last-download status, seven-day snooze and opt-out. Full JSON/encrypted backup downloads update the status; Markdown and research bundles do not. Changes made while exporting remain pending.
- **Repair a missing highlight:** choose its original website or saved article, select a replacement passage, review old/new text, and confirm. The same highlight keeps its notes, colors, tags, study cards and audio. Its original quotation and recent repair locations are retained. Escape cancels; stale edits are rejected.
- **A gentler first use:** a dismissible checklist and a bundled practice page using the real highlighter. Nothing is saved until you make a highlight. Reopen the guide from Settings whenever you want.

[New-feature tutorials](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/GETTING-STARTED.md#new-in-07) · [All features](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/FEATURES.md)

## Download and install

| Browser | Asset                               | Tutorial                                                                                                                           |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Chrome  | `margin-0.7.0-chrome.zip`           | [Chrome](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#google-chrome)                           |
| Edge    | `margin-0.7.0-edge.zip`             | [Edge](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#microsoft-edge)                            |
| Brave   | `margin-0.7.0-brave.zip`            | [Brave](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#brave)                                    |
| Firefox | `margin-0.7.0-firefox-unsigned.xpi` | [Firefox temporary installation](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#mozilla-firefox) |

For Chromium browsers: extract the ZIP, open the browser’s extensions page, enable Developer mode, choose **Load unpacked**, and select the extracted folder. Firefox remains an unsigned temporary add-on until Mozilla signing.

**Updating? Export a full backup first, replace the files in the same installed folder, reload the same extension entry, and refresh website/library tabs. Do not uninstall to update.** Existing version-2 research and backups remain compatible. If you use a configured Google build, rebuild that configured installation; public packages deliberately exclude maintainer OAuth registration.

## Privacy and limits

Reminder dates/counters and guide progress stay on the device and are excluded from research backups/sync. Repaired quotations/history are research records and are included in full backups and configured Drive sync. A download request cannot confirm that you kept the file; check your downloads before relying on it.

Repair currently supports website/saved-article highlights, not PDF locations. A new live quotation may not exist in an older offline copy. Dictation/models remain browser/device dependent. Optional public Google sign-in still needs a separately configured build; no paid service was enabled.

## Validation

62 unit tests, the new workflow suite in Chromium/Edge/Brave, and native Firefox practice/repair checks passed locally. Existing annotation, PDF, export, recording and restore checks were also exercised. Sync fixtures check repair-history propagation and device-state isolation. The downloadable archives include SHA-256 checksums and a source snapshot. See [browser validation and limits](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/CROSS-BROWSER.md).
