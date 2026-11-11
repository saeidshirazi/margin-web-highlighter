import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';

export function zipArchive(files) {
  const text =
    /\.(?:js|mjs|json|html|css|svg|md|yml|ps1|txt)$|(?:^|\/)LICENSE$|^\.(?:gitignore|gitattributes|prettierignore)$/;
  const ordered = Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return zipSync(
    Object.fromEntries(
      ordered.map(([name, bytes]) => {
        const data = text.test(name)
          ? new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/\r\n/g, '\n'))
          : bytes;
        return [name, [data, { mtime: new Date(2020, 0, 1) }]];
      }),
    ),
    { level: 6 },
  );
}

// Archive paths always use forward slashes. Do not follow symlinks into local files.
export async function archiveFiles(directory, include = () => true) {
  const files = Object.create(null);
  async function collect(folder, prefix) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (!include(name, entry)) continue;
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) await collect(filename, name + '/');
      else if (entry.isFile()) files[name] = await readFile(filename);
    }
  }
  await collect(directory, '');
  return files;
}
