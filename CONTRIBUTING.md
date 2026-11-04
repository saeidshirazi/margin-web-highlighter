# Contributing to Margin

Thanks for helping make reading and research easier. Start with a small bug report, documentation fix, or focused pull request. For substantial behavior changes, open an issue first so the design can be discussed.

## Local setup

Use Node.js 24+ and npm:

```sh
npm ci
npm run build:all
npm test
npm run lint
npm run format:check
```

Load `dist` in Chrome, `dist-edge` in Edge, `dist-brave` in Brave, or `dist-firefox/manifest.json` as a temporary Firefox add-on. See [installation](docs/INSTALL.md).

## Browser checks

```sh
npx playwright install chromium firefox
npm run test:e2e
npm run test:experience
npm run test:organization
npm run test:native
npm run test:drive
npm run build:firefox
npm run test:firefox
```

Sync integration tests use **local OAuth/Drive fixtures**, never a real account. Firefox sync tests need a web client ID baked into the fixture build, plus the Edge build. For these tests only, build with `MARGIN_GOOGLE_WEB_CLIENT_ID=123-ci-fixture.apps.googleusercontent.com`, then run `npm run build:edge`, `npm run build:firefox`, and `npm run test:firefox:drive`. This fake value cannot authenticate with Google. On Linux, set `MARGIN_CROSS_CHROMIUM=chromium`; on Windows it defaults to installed Edge.

For installed Brave, set `MARGIN_TEST_BROWSER=brave` before running the Chromium suites; for Edge use `MARGIN_TEST_BROWSER=edge`. Drive tests need a configured or fixture web-client build. `MARGIN_BRAVE_BINARY` overrides Brave’s executable location. Keep `MARGIN_LIVE_TRANSLATION_TEST=0` for deterministic native tests without external translation requests. [More browser details](CROSS-BROWSER.md).

Tests use isolated profiles and synthetic data. Firefox’s isolated WebDriver process explicitly enables system access to test its own extension pages. Never point a test at a personal browser profile.

## Design principles

- Keep highlighting, notes, local storage, and exports useful without an account or model.
- Do not introduce telemetry, external scripts, silent cloud fallbacks, proprietary assets, or bundled private credentials.
- Make optional network actions explicit, with appropriate permission and privacy updates.
- Preserve user data on migration, updates, import, and sync. Add meaningful regression coverage for anchoring, data loss, security, and format changes.
- Inspect relevant screenshots for UI changes. Check keyboard access, small windows, contrast and reduced-motion behavior.
- Keep PRs focused. Explain the problem, resulting behavior, and validation.

Do not commit browser profiles, personal highlights, backups, private PDFs, tokens, API keys, or `google-oauth.local.json`. Format with `npm run format`. Contributions must be compatible with the [MIT license](LICENSE); preserve bundled third-party notices.

## Release checklist

1. Update `package.json` and `public/manifest.json` versions together, along with documentation/download names.
2. Run checks and appropriate browser suites; inspect native recordings/PDF exports and review dependency advisories.
3. Run `npm run package:public`, then `npm run verify:release`. This builds into isolated staging folders and excludes local OAuth configuration; existing configured browser installations are preserved.
4. Attach files from `release/public` to a GitHub release. Keep `manifest.json` at each browser archive root. Publish a source snapshot and checksums alongside browser downloads.
5. State Firefox signing status and optional Google OAuth setup accurately. Do not label a ZIP as a browser-store listing or claim universal site/model support.
6. For configured public Google sign-in, complete the appropriate Google consent-screen process and verify exact production IDs/callbacks. Never bundle a client secret.

The build does not create a remote repository, publish to browser stores, or enable a paid service.
