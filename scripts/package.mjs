import { zipSync } from 'fflate';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
let files = {};
const publicBuild = process.argv.includes('--public');
const releaseDir = publicBuild ? 'release/public' : 'release';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
async function collect(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) await collect(path.join(dir, entry.name), key + '/');
    else files[key] = new Uint8Array(await readFile(path.join(dir, entry.name)));
  }
}
await mkdir(releaseDir, { recursive: true });
for (const [target, folder] of Object.entries({
  chrome: 'dist',
  edge: 'dist-edge',
  brave: 'dist-brave',
  firefox: 'dist-firefox',
})) {
  const output = publicBuild ? `work/public-${target}` : folder;
  execFileSync(
    process.execPath,
    [
      'scripts/build.mjs',
      `--target=${target}`,
      ...(publicBuild ? ['--public', `--outdir=${output}`] : []),
    ],
    { stdio: 'inherit' },
  );
  files = {};
  await collect(output);
  const suffix = target === 'firefox' ? 'firefox-unsigned.xpi' : `${target}.zip`;
  await writeFile(`${releaseDir}/margin-${version}-${suffix}`, zipSync(files, { level: 6 }));
}
const source = {};
async function collectSource(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      [
        'node_modules',
        'dist',
        'dist-edge',
        'dist-brave',
        'dist-firefox',
        'release',
        'test-results',
        'work',
        '.git',
        'google-oauth.local.json',
      ].includes(entry.name)
    )
      continue;
    const key = prefix + entry.name;
    if (entry.isDirectory()) await collectSource(path.join(dir, entry.name), key + '/');
    else if (!entry.name.endsWith('.log'))
      source[key] = new Uint8Array(await readFile(path.join(dir, entry.name)));
  }
}
await collectSource('.');
await writeFile(`${releaseDir}/margin-${version}-source.zip`, zipSync(source, { level: 6 }));
console.log(
  `Release: Chrome, Edge and Brave ZIPs, unsigned Firefox XPI, and source ZIP in ${releaseDir}/ (${version}).`,
);
