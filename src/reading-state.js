export const READING_LIMIT = 8;

export function mergeReadingPositions(...lists) {
  const latest = new Map();
  for (const list of lists) {
    for (const entry of Array.isArray(list) ? list.slice(0, READING_LIMIT) : []) {
      if (
        typeof entry?.id !== 'string' ||
        !Number.isSafeInteger(entry.updatedAt) ||
        entry.updatedAt < 0 ||
        !Number.isFinite(entry.position) ||
        !(entry.kind === 'pdf'
          ? Number.isSafeInteger(entry.position) && entry.position >= 1
          : entry.kind === 'reader' && entry.position >= 0 && entry.position <= 1)
      )
        continue;
      const { id, kind, position, updatedAt } = entry;
      const old = latest.get(id);
      if (
        !old ||
        updatedAt > old.updatedAt ||
        (updatedAt === old.updatedAt && position > old.position)
      )
        latest.set(id, { id, kind, position, updatedAt });
    }
  }
  return [...latest.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1))
    .slice(0, READING_LIMIT);
}

// Use the same source URL as library sync so each browser can keep its own local ID.
export function mapReadingPositions(entries, pages, toWire = false) {
  const sources = new Map(pages.map((page) => [toWire ? page.id : page.url, page]));
  return entries.flatMap((entry, index) => {
    const page = sources.get(entry.id);
    if (!page || entry.kind !== (page.type === 'pdf' ? 'pdf' : 'reader')) return [];
    return [
      {
        ...entry,
        id: toWire ? page.url : page.id,
        // Positions saved before syncing existed have an order but no wall-clock time.
        updatedAt: entry.updatedAt ?? READING_LIMIT - index,
      },
    ];
  });
}
