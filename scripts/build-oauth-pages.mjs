import { readFile, writeFile } from 'node:fs/promises';
import { marked } from 'marked';
import { logoSVG } from '../src/brand.js';
const repo = 'https://github.com/saeidshirazi/margin-web-highlighter';
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const shell = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Margin is a free, open-source browser highlighter with local research storage, portable exports and optional Google Drive sync."><title>${escape(title)} · Margin</title><link rel="icon" href="site-logo.svg"><link rel="stylesheet" href="site.css"></head><body><header><a class="brand" href="./"><img src="site-logo.svg" width="40" height="40" alt="">Margin</a><nav aria-label="Main"><a href="${repo}/releases/latest">Download</a><a href="${repo}/blob/main/docs/INSTALL.md">Install guide</a><a href="${repo}">Source</a></nav></header><main>${body}</main><footer><a href="privacy.html">Privacy policy</a><a href="terms.html">Terms &amp; license</a><a href="${repo}/issues">Support</a><span>Free and open source. Local first.</span></footer></body></html>\n`;
await writeFile(
  'docs/index.html',
  shell(
    'Keep what stays with you',
    `<section class="hero"><p class="eyebrow">Ideas worth keeping</p><h1>Keep what stays<br>with you.</h1><p class="lede">Highlight webpages, collect notes and turn reading into research. Your library lives on your device, with easy exports and optional Google Drive sync.</p><div class="actions"><a class="button" href="${repo}/releases/latest">Download Margin</a><a href="${repo}/blob/main/docs/INSTALL.md">Installation for every browser →</a></div><p>Chrome · Edge · Brave · Firefox<br><small>Firefox marketplace submission is awaiting review; current GitHub XPI uses temporary installation.</small></p></section><section><h2>Your research, within reach.</h2><div class="features"><article><h3>Highlight &amp; organize</h3><p>Colored highlights, Markdown notes, bookmarks, nested collections and flashcards. Save articles and PDFs for offline reading.</p></article><article><h3>Take your work anywhere</h3><p>Import Markdown. Export to Markdown, Notion-ready files or structured AI-agent bundles. Download complete backups, optionally encrypted.</p></article><article><h3>Keep your own copy</h3><p>No account is required for local research. No telemetry, advertising or developer-operated research server.</p></article></div></section><section class="panel"><h2>Optional Google Drive sync</h2><p>Connect your Google account only if you want to synchronize research between installations. Margin requests <code>drive.appdata</code>, which accesses its own hidden app-data folder rather than unrelated Drive documents.</p><p>When connected, saved URLs, quotations, notes, articles, PDFs, audio, cards and preferences are sent to Google Drive. Margin adds no end-to-end encryption to sync. Your Google storage quota applies. You can pause or disconnect sync and keep working locally.</p><p><strong>Current public downloads require a separately configured build for Drive.</strong> Public Google sign-in is being prepared; do not expect one-click sync until a configured release is announced.</p><a href="privacy.html">Read exactly what is stored and shared →</a></section><section><h2>A small habit, a growing library.</h2><p>Local audio notes, available system voices, explicit Google Translate handoff and saved export presets help you keep reading moving. Speech and model availability vary by browser. No paid service is required for core features.</p><a href="${repo}/blob/main/FEATURES.md">Explore all features →</a></section>`,
  ),
);
let privacy = await readFile('PRIVACY.md', 'utf8');
privacy = privacy.replaceAll('(CROSS-BROWSER.md)', `(${repo}/blob/main/CROSS-BROWSER.md)`);
await writeFile(
  'docs/privacy.html',
  shell(
    'Privacy policy',
    marked.parse(privacy) +
      `<h2>This project website</h2><p>This static website has no analytics scripts, advertising or sign-in. GitHub Pages hosts it and records visitor IP addresses for security under <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">GitHub’s privacy policy</a>. The extension’s research database is separate from this website.</p><p>Questions: <a href="${repo}/issues">project support</a>. Please do not post private research or credentials in public issues.</p>`,
  ),
);
await writeFile(
  'docs/terms.html',
  shell(
    'Terms and license',
    `<h1>Terms and license</h1><p>Margin is free, open-source software distributed under the existing MIT license. No subscription or payment is required for its core local features. Third-party services are optional and governed by their own terms and storage limits.</p><p>The software is provided “as is,” without warranty, as detailed in the license. Keep independent backups of important research. The maintainer does not provide an account service or guarantee third-party availability.</p><h2>MIT license</h2><pre>${escape(await readFile('LICENSE', 'utf8'))}</pre><p><a href="${repo}/issues">Support</a> · <a href="privacy.html">Privacy policy</a></p>`,
  ),
);
await writeFile('docs/site-logo.svg', logoSVG(128));
await writeFile('docs/.nojekyll', '');
console.log('Generated static homepage, privacy policy and existing license pages.');
