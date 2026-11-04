# Margin 0.8.0 — Collections that grow with your research

This update adds nested collection management and reusable export presets, with no new extension permissions or dependencies.

## What’s new

- **Nested collections:** parent folders, descendant counts, collapse/expand controls, keyboard navigation and collection deep links.
- **Safe organization:** atomically rename/move a branch or bulk-move sources. Drag sources or folders, or use the keyboard. Existing destinations and cycles are rejected. Remove collection labels without deleting research.
- **Guarded undo:** restore the last organization change while retaining later note edits. If sources were moved/deleted afterward, undo refuses to overwrite newer organization.
- **Saved export presets:** up to 20 explicit research exports for a selection/filtered view, the whole library, or a collection subtree. A missing collection never broadens the scope. Passwords and keys cannot be stored.
- **Portable presets:** full JSON backups include preset metadata and merge it on restore. Research collection paths sync through configured Drive; presets remain browser-local. Local rename/move operations update scoped preset paths.

[Organization tutorial](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/ORGANIZATION.md) · [All features](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/FEATURES.md)

## Download and install

| Browser | Asset                               | Tutorial                                                                                                                           |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Chrome  | `margin-0.8.0-chrome.zip`           | [Chrome](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#google-chrome)                           |
| Edge    | `margin-0.8.0-edge.zip`             | [Edge](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#microsoft-edge)                            |
| Brave   | `margin-0.8.0-brave.zip`            | [Brave](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#brave)                                    |
| Firefox | `margin-0.8.0-firefox-unsigned.xpi` | [Firefox temporary installation](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md#mozilla-firefox) |

**Back up first, replace files in the same installed folder, reload the same extension entry, and refresh website/library tabs. Do not uninstall to update.** Existing research and version-2 backups remain compatible. Older versions ignore the optional preset metadata. Configured Google users should rebuild their configured installation; public downloads omit maintainer OAuth registration.

Collections appear when they contain sources; empty folders are not separate stored objects. Undo is available only for the last organization action in the current tab, until reload. Firefox signing/account setup remains deferred; the XPI is still an unsigned temporary add-on. No paid service was enabled.

## Validation

69 unit tests pass. Native Chromium, Edge and Brave workflow tests cover hierarchy, keyboard, drag/drop, collisions, cycles, linked-data preservation, undo, scoped agent ZIP contents and preset backup/import. Firefox passed native nested navigation, keyboard rename and saved one-click agent export alongside its regression suite. Sync fixtures verify research compatibility and device-local presets. The source snapshot and SHA-256 checksums are attached with the four browser packages.
