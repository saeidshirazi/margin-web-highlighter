# Security policy

## Supported release

Report security issues against the latest tagged release. The current release is 0.6.0. Fixes are provided on a best-effort basis; there is no guaranteed response-time SLA.

## Report privately

Use **Security → Report a vulnerability** in this GitHub repository for potential data exposure, script execution, import/backup, or sync vulnerabilities. Do not open a public issue with exploit details or private data. If private reporting is temporarily unavailable, open an issue requesting a private contact channel without describing the vulnerability.

Include the extension/browser versions, expected impact, and a minimal public or synthetic reproduction. Do not include credentials, passwords, private notes, or real research backups. For ordinary non-security bugs, use the bug-report issue form.

## Scope and data handling

Review [Privacy](PRIVACY.md) for storage, permissions and optional online services. Keep independent backups. Optional sync is not end-to-end encrypted by Margin. A user-selected encrypted backup does not encrypt the extension’s local database.

Public packages exclude maintainer OAuth registration, API keys, client secrets, tokens and personal research. Public manifest keys and OAuth client IDs are identifiers, not private signing credentials. Please still avoid attaching your local configuration to an issue.
