import { extension, openSidebar } from './platform.js';
import { api } from './api.js';
import { showReleaseNotice } from './release-update-ui.js';
import { releaseUpdateKey } from './release-updates.js';
import { icon, esc, toast, applyTheme } from './ui.js';
let tab, data, status;
const root = document.querySelector('#app');
async function send(action) {
  const r = await extension.tabs.sendMessage(tab.id, { action });
  if (!r?.ok) throw new Error(r?.error || 'Reload this tab to activate Margin');
  return r.data;
}
async function init() {
  [tab] = await extension.tabs.query({ active: true, currentWindow: true });
  data = await api('snapshot');
  applyTheme(data.settings.theme);
  try {
    status = undefined;
    status = await send('status');
  } catch {}
  const url = status?.url || tab.url || '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {}
  if (status) status.disabled = data.settings.disabledSites.includes(host);
  root.innerHTML = `<div class="popup"><div class="brand"><span class="brand-mark">${icon('logo', 25)}</span><div>margin<small>Your reading, remembered</small></div></div><div class="eyebrow">${status ? 'Ready to highlight' : 'Your local reading space'}</div><h2>${esc((status?.title || tab.title || 'Welcome to Margin').slice(0, 90))}</h2>${status ? `<div class="row" id="palette">${data.settings.colors.map((c) => `<button class="swatch ${data.settings.color === c ? 'active' : ''}" style="background:${c}" data-color="${c}" aria-label="Default color ${c}"></button>`).join('')}<input type="color" id="custom" value="${data.settings.color}" aria-label="Custom default color" style="width:28px;height:28px;padding:0;border:0"></div>` : '<p class="muted small">Open a website and reload it after installation. For PDFs, use the PDF viewer in your library.</p>'}<div class="menu"><button id="library" class="primary">${icon('book')}Open your library <span class="small" style="margin-left:auto">${data.pages.length} pages</span></button><button id="quick-note">${icon('plus')}Quick note</button><button id="voice-note">${icon('mic')}Record voice / dictate</button>${status ? `<button data-send="quick">${icon('flash')}Quick highlight <span class="muted small" style="margin-left:auto">Alt Q</span></button><button data-send="bookmark">${icon('bookmark')}Save this page</button><button data-send="reader">${icon('file')}Save for offline reading</button><button id="panel">${icon('tag')}Open page sidebar</button><button id="pause">${icon('settings')}${status.disabled ? 'Resume on this site' : 'Pause on this site'}</button>` : ''}</div><div data-release-notice hidden></div><div class="footer row"><i class="dot"></i>Local first · Optional Drive sync</div></div>`;
  refreshReleaseNotice();
  root.querySelector('#library').onclick = () => api('open-library');
  for (const [id, mode] of [
    ['quick-note', 'text'],
    ['voice-note', 'voice'],
  ])
    root.querySelector('#' + id).onclick = () =>
      api('open-capture', {
        ...(status
          ? { url: status.url, title: status.title, tabId: tab.id }
          : /^https?:|^file:/.test(url)
            ? { url, title: tab.title, tabId: tab.id }
            : {}),
        mode,
      })
        .then(() => window.close())
        .catch((e) => toast(e.message));
  root.querySelectorAll('[data-send]').forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await send(b.dataset.send);
          toast(b.dataset.send === 'bookmark' ? 'Page saved' : 'Ready');
          if (b.dataset.send === 'quick' || b.dataset.send === 'reader') window.close();
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  root.querySelectorAll('[data-color]').forEach(
    (b) =>
      (b.onclick = async () => {
        await api('settings', { color: b.dataset.color });
        await init();
      }),
  );
  if (root.querySelector('#custom'))
    root.querySelector('#custom').onchange = async (e) => {
      await api('settings', { color: e.target.value });
      await init();
    };
  if (status) {
    root.querySelector('#panel').onclick = async () => {
      try {
        await openSidebar(tab.id);
        window.close();
      } catch (e) {
        toast(e.message);
      }
    };
    root.querySelector('#pause').onclick = async () => {
      const disabledSites = status.disabled
        ? data.settings.disabledSites.filter((s) => s !== host)
        : [...data.settings.disabledSites, host];
      await api('settings', { disabledSites });
      status.disabled = !status.disabled;
      await init();
    };
  }
}
function refreshReleaseNotice() {
  showReleaseNotice(root.querySelector('[data-release-notice]')).catch(() => {});
}
extension.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[releaseUpdateKey]) refreshReleaseNotice();
});
init().catch((e) => (root.innerHTML = `<div class="popup">${esc(e.message)}</div>`));
