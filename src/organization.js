export const PRESETS_KEY = 'export-presets';
export const MAX_EXPORT_PRESETS = 20;
const presetFormats = ['md', 'notion', 'agent', 'html', 'csv', 'clipboard', 'notion-copy', 'print'];
export function collectionPath(value) {
  return String(value || '')
    .normalize('NFC')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}
export function collectionTarget(value, allowEmpty = true) {
  const path = collectionPath(value);
  if (
    (!allowEmpty && !path) ||
    path.length > 500 ||
    path.split('/').length > 10 ||
    path.split('/').some((part) => part === '.' || part === '..' || part.length > 80) ||
    [...path].some((char) => char.charCodeAt(0) < 32 || char === '\\')
  )
    throw new Error('Use a collection path with up to 10 names of 80 characters, separated by /.');
  return path;
}
export function inCollection(path, parent) {
  path = collectionPath(path);
  parent = collectionPath(parent);
  return !!parent && (path === parent || path.startsWith(parent + '/'));
}
export function collectionTree(pages) {
  const nodes = new Map();
  for (const page of pages) {
    const parts = collectionPath(page.collection).split('/').filter(Boolean);
    for (let depth = 0; depth < parts.length; depth++) {
      const path = parts.slice(0, depth + 1).join('/');
      if (!nodes.has(path))
        nodes.set(path, {
          path,
          name: parts[depth],
          parent: parts.slice(0, depth).join('/'),
          depth,
          count: 0,
        });
      nodes.get(path).count++;
    }
  }
  return [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path));
}
export function normalizePreset(input) {
  if (
    !input ||
    typeof input.id !== 'string' ||
    !/^[\w-]{1,100}$/.test(input.id) ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.length > 80 ||
    !presetFormats.includes(input.format) ||
    !['view', 'all', 'collection'].includes(input.scope)
  )
    throw new Error('Choose a preset name, research format, and scope.');
  const markdown = ['md', 'notion', 'agent', 'clipboard', 'notion-copy'].includes(input.format);
  return {
    id: input.id,
    name: input.name.trim(),
    format: input.format,
    scope: input.scope,
    collection: input.scope === 'collection' ? collectionTarget(input.collection, false) : '',
    metadata: markdown && input.metadata === true,
    includeSource: markdown && input.includeSource === true,
  };
}
export function normalizePresets(value = []) {
  if (!Array.isArray(value) || value.length > MAX_EXPORT_PRESETS)
    throw new Error(`Keep at most ${MAX_EXPORT_PRESETS} export presets.`);
  const presets = value.map(normalizePreset);
  if (new Set(presets.map((preset) => preset.id)).size !== presets.length)
    throw new Error('Duplicate export preset IDs.');
  return presets;
}
export function presetPages(preset, snapshot, visible) {
  if (preset.scope === 'all') return snapshot.pages;
  if (preset.scope === 'collection')
    return snapshot.pages.filter((page) => inCollection(page.collection, preset.collection));
  return visible;
}
