import { zipSync } from 'fflate';
import { access, cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { archiveFiles } from './archive-files.mjs';
import { targets } from './browser-manifest.mjs';
import { scratchDirectory } from './scratch-directory.mjs';

const publicBuild = process.argv.includes('--public');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const releaseDir = path.join('release', publicBuild ? 'public' : 'local', `v${version}`);

if (publicBuild) {
  const verified = await access(path.join(releaseDir, 'SHA256SUMS.txt')).then(
    () => true,
    (error) => {
      if (error.code !== 'ENOENT') throw error;
      return false;
    },
  );
  if (verified)
    throw new Error(
      `Verified archives already exist in ${releaseDir}. Use a new version for the next public release.`,
    );
}

// Build ZIPs from fresh outputs, then refresh the stable folders used by installed
// extensions and browser tests. Old files in those folders cannot enter an archive.
await using scratch = await scratchDirectory('package');
await mkdir(releaseDir, { recursive: true });
for (const [target, folder] of Object.entries(targets)) {
  const output = path.join(scratch.path, target);
  execFileSync(
    process.execPath,
    [
      'scripts/build.mjs',
      `--target=${target}`,
      `--outdir=${output}`,
      ...(publicBuild ? ['--public'] : []),
    ],
    { stdio: 'inherit' },
  );
  const suffix = target === 'firefox' ? 'firefox-unsigned.xpi' : `${target}.zip`;
  await writeFile(
    `${releaseDir}/margin-${version}-${suffix}`,
    zipSync(await archiveFiles(output), { level: 6 }),
  );
  await cp(output, publicBuild ? `work/public-${target}` : folder, { recursive: true });
}

// Keep this inventory usable in an extracted source ZIP without Git metadata.
const rootFiles = new Set([
  '.gitattributes',
  '.gitignore',
  '.prettierignore',
  '.prettierrc.json',
  'eslint.config.js',
  'package.json',
  'package-lock.json',
  'LICENSE',
  'ARCHITECTURE.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'CROSS-BROWSER.md',
  'FEATURES.md',
  'GOOGLE-DRIVE.md',
  'PRIVACY.md',
  'README.md',
  'RELEASE-PLAN.md',
  'SECURITY.md',
]);
const sourceFolders = new Set([
  '.github',
  '.github/ISSUE_TEMPLATE',
  '.github/workflows',
  'brand',
  'config',
  'docs',
  'docs/images',
  'public',
  'scripts',
  'src',
  'tests',
]);
const sourcePatterns = [
  /^\.github\/(?:PULL_REQUEST_TEMPLATE\.md|(?:ISSUE_TEMPLATE|workflows)\/[\w-]+\.yml)$/,
  /^brand\/[\w-]+\.(?:png|svg)$/,
  /^config\/(?:browser-ids|google-oauth\.public|translation-relay\.public)\.json$/,
  /^docs\/(?:\.nojekyll|[\w.-]+\.(?:md|html|css|svg)|images\/[\w-]+\.png)$/,
  /^public\/(?:manifest\.json|[\w-]+\.html)$/,
  /^(?:scripts|tests)\/[\w.-]+\.mjs$/,
  /^scripts\/translation-relay\.gs$/,
  /^src\/[\w-]+\.(?:js|css)$/,
];
const source = await archiveFiles('.', (name, entry) =>
  entry.isDirectory()
    ? sourceFolders.has(name)
    : rootFiles.has(name) || sourcePatterns.some((pattern) => pattern.test(name)),
);
await writeFile(`${releaseDir}/margin-${version}-source.zip`, zipSync(source, { level: 6 }));
console.log(
  `Packaged Margin ${version} for four browsers and archived the source in ${releaseDir}/.`,
);
