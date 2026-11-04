import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
const excluded = new Set([
  'node_modules',
  '.git',
  'work',
  'release',
  'test-results',
  'dist',
  'dist-edge',
  'dist-brave',
  'dist-firefox',
]);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(name);
    else if (entry.name.endsWith('.md')) files.push(name);
  }
}
await walk('.');
let checked = 0;
for (const file of files) {
  const text = await readFile(file, 'utf8');
  if (text.includes('github.com/OWNER/')) throw new Error(`Unresolved repository link: ${file}`);
  const references = [...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  references.push(...[...text.matchAll(/src="([^"]+)"/g)].map((match) => match[1]));
  for (const reference of references) {
    if (/^(https?:|mailto:)/.test(reference)) continue;
    const [location, fragment] = reference.split('#');
    const target = location
      ? path.resolve(path.dirname(file), decodeURIComponent(location))
      : path.resolve(file);
    await access(target).catch(() => {
      throw new Error(`Broken link in ${file}: ${reference}`);
    });
    if (fragment && target.endsWith('.md')) {
      const body = await readFile(target, 'utf8');
      const headings = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) =>
        match[1]
          .toLowerCase()
          .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
          .replace(/\s/g, '-'),
      );
      if (!headings.includes(fragment)) throw new Error(`Missing heading in ${file}: ${reference}`);
    }
    checked++;
  }
}
console.log(`Checked ${checked} local links across ${files.length} Markdown files.`);
