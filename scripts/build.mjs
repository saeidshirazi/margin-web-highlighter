import { build } from 'esbuild';
import { mkdir, cp, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { logoSVG } from '../src/brand.js';
import { browserManifest, targets } from './browser-manifest.mjs';
const target = process.argv.find((value) => value.startsWith('--target='))?.slice(9) || 'chrome';
if (!targets[target]) throw new Error('Unknown browser target');
const publicBuild = process.argv.includes('--public');
const folder =
    process.argv.find((value) => value.startsWith('--outdir='))?.slice(9) || targets[target],
  dest = path.resolve(folder);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const baseManifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
let google = {};
try {
  google = JSON.parse(
    await readFile(
      publicBuild ? 'config/google-oauth.public.json' : 'google-oauth.local.json',
      'utf8',
    ),
  );
  if (publicBuild && google.enabled !== true) google = {};
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const ids = JSON.parse(await readFile('config/browser-ids.json', 'utf8'));
const relayConfig = JSON.parse(await readFile('config/translation-relay.public.json', 'utf8'));
const relayUrl =
  (publicBuild ? relayConfig.url : (process.env.MARGIN_TRANSLATION_RELAY_URL ?? relayConfig.url)) ||
  '';
if (relayUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(relayUrl))
  throw new Error('The translation relay URL must be a Google Apps Script /exec URL.');
const manifest = browserManifest(baseManifest, target, google, ids, { publicBuild });
const oauthWebClientId = publicBuild
  ? google.webClientId || ''
  : target === 'chrome'
    ? ''
    : process.env.MARGIN_GOOGLE_WEB_CLIENT_ID || google.webClientId || '';
if (oauthWebClientId && !/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(oauthWebClientId))
  throw new Error('Invalid Google web OAuth client ID');
if (pkg.version !== manifest.version)
  throw new Error('Keep package.json and manifest.json versions in sync');
await mkdir(dest, { recursive: true });
await cp('public', dest, { recursive: true });
await writeFile(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const entries = [
  'background',
  'content',
  'library',
  'popup',
  'panel',
  'reader',
  'pdf',
  'print',
  'capture',
  'practice',
  'proofreading-worker',
];
await Promise.all(
  entries.map((name) =>
    build({
      entryPoints: [`src/${name}.js`],
      outfile: `${folder}/${name}.js`,
      bundle: true,
      format: name === 'content' ? 'iife' : 'esm',
      target: target === 'firefox' ? 'firefox150' : 'chrome150',
      define: {
        // Harper has a Node-only filesystem loader. Extension workers use the browser loader.
        ...(['background', 'proofreading-worker'].includes(name) ? { process: 'undefined' } : {}),
        __MARGIN_TARGET__: JSON.stringify(target),
        __MARGIN_WEB_CLIENT_ID__: JSON.stringify(oauthWebClientId),
        __MARGIN_TRANSLATION_RELAY_URL__: JSON.stringify(relayUrl),
      },
      minify: false,
      legalComments: 'eof',
    }),
  ),
);
for (const name of entries.filter(
  (n) => !['background', 'content', 'proofreading-worker'].includes(n),
)) {
  await writeFile(
    `${folder}/${name}.html`,
    `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Margin · ${name === 'library' ? 'Your local library' : name}</title><link rel="icon" href="icons/32.png"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="polish.css"><link rel="stylesheet" href="workspace.css"></head><body><div id="app"><p class="loading">Opening your reading space…</p></div><script type="module" src="${name}.js"></script></body></html>\n`,
  );
}
await cp('src/styles.css', `${folder}/styles.css`);
await cp('src/polish.css', `${folder}/polish.css`);
await cp('src/workspace.css', `${folder}/workspace.css`);
await cp(
  'node_modules/harper.js/dist/harper_wasm_slim_bg.wasm',
  `${folder}/harper_wasm_slim_bg.wasm`,
);
await cp('node_modules/pdfjs-dist/web/pdf_viewer.css', `${folder}/pdf_viewer.css`);
await cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', `${folder}/pdf.worker.mjs`);
for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'web/images'])
  await cp(
    'node_modules/pdfjs-dist/' + folder,
    path.join(dest, folder === 'web/images' ? 'images' : folder),
    { recursive: true },
  );
await mkdir(path.join(dest, 'icons'), { recursive: true });
const svg = logoSVG(512);
await writeFile(path.join(dest, 'icons/margin.svg'), svg);
for (const size of [16, 32, 48, 128])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(dest, `icons/${size}.png`));
await writeFile(path.join(dest, 'THIRD_PARTY_NOTICES.txt'), await thirdParty());
async function thirdParty() {
  const packages = [
    '@mozilla/readability',
    'dompurify',
    'marked',
    'pdfjs-dist',
    'pdf-lib',
    '@pdf-lib/standard-fonts',
    '@pdf-lib/upng',
    'pako',
    'tslib',
    'fflate',
    'harper.js',
  ];
  let text = 'Margin bundles the following open-source libraries.\n\n';
  for (const pkg of packages) {
    const dir = 'node_modules/' + pkg;
    const meta = JSON.parse(await readFile(dir + '/package.json', 'utf8'));
    text += `${meta.name} ${meta.version} — ${meta.license}\n`;
    for (const file of (await readdir(dir)).filter((f) => /^licen[sc]e/i.test(f))) {
      try {
        text += await readFile(dir + '/' + file, 'utf8');
      } catch {}
    }
    text += '\n\n';
  }
  return text;
}
console.log(`Built Margin for ${target} in ${folder}/.`);
