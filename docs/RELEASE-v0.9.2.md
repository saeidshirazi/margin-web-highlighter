## Maintenance improvements

- PDF pages and attachments save together. Concurrent settings changes and study reviews keep both edits. Repeated undo preserves newer highlight changes.
- Markdown rendering uses shared sanitization across the library, sidebar, reader, and rich clipboard output. Record identifiers are escaped in UI attributes.
- Remote PDFs enforce the 50 MB limit during download. Bookmarks survive library reloads, and searching from Settings returns to the library correctly.
- Export UI has a dedicated module. Local release archives are grouped by version, with checksum protection for verified packages.

## Install or update

Download the package for Chrome, Edge, Brave, or Firefox under **Assets**. Back up your library, extract your browser ZIP into its existing installation folder, and reload the extension. The Firefox XPI is unsigned and loads temporarily.

[Install and update guide](https://github.com/saeidshirazi/margin-web-highlighter/blob/main/docs/INSTALL.md)
