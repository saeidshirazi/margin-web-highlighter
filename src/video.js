import { extension } from './platform.js';
export function timestampSeconds(value) {
  const parts = String(value).trim().split(':').map(Number);
  return parts.length <= 3 && parts.every(Number.isFinite)
    ? parts.reduce((sum, part) => sum * 60 + part, 0)
    : 0;
}
export function videoId(url) {
  try {
    const u = new URL(url);
    return /(^|\.)youtube\.com$/.test(u.hostname) ? u.searchParams.get('v') : null;
  } catch {
    return null;
  }
}
export async function findVideoTab(url) {
  const id = videoId(url);
  if (!id) return null;
  for (const tab of await extension.tabs.query({})) {
    try {
      const reply = await extension.tabs.sendMessage(tab.id, { action: 'video-status' });
      if (reply.ok && videoId(reply.data?.url) === id) return { tab, ...reply.data };
    } catch {
      /* Not a YouTube tab. */
    }
  }
  return null;
}
