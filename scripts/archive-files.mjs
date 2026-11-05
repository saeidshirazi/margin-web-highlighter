import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

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
