import { extension, networkPermission } from './platform.js';
import { api, download } from './api.js';
import { DRIVE_ORIGIN } from './drive-client.js';
import { esc } from './ui.js';
import { get } from './db.js';

export function addDriveSettings(content) {
  const section = document.createElement('section');
  section.className = 'settings-section drive-settings';
  section.innerHTML = `<div class="row between wrap"><div><span class="eyebrow">Your library, wherever you read</span><h2>Connect your Google account</h2></div><span class="sync-pill" data-drive-label>Local only</span></div><p>Use your Gmail or other Google account to keep your full library across Chrome, Edge, Brave, and Firefox. Sign in with Google, allow access to Margin’s private Drive folder, and your research will sync automatically.</p><p class="muted small">Margin uses its own private app-data folder in your Drive. It cannot browse your other Drive files. Data stays on this device too. Sync copies are not password-encrypted by Margin.</p><div class="sync-account" data-drive-account></div><p data-drive-status role="status" aria-live="polite">Checking sync settings…</p><p class="muted small" data-drive-time></p><p class="muted small" data-drive-consent>By continuing, you allow Margin to sync your full saved library, including PDFs and audio, with your Google Drive. Changes and deletions sync across connected devices. Google will ask you to approve Drive access.</p><div class="row wrap sync-actions"><button type="button" data-drive-connect class="primary google-connect">Continue with Google</button><button type="button" data-drive-now hidden>Sync now</button><button type="button" data-drive-toggle hidden>Pause automatic sync</button><button type="button" data-drive-disconnect hidden>Disconnect</button><button type="button" data-drive-recovery hidden>Download recovery copies</button></div><p class="muted small">Automatic sync runs about 30 seconds after changes and every 5 minutes while your browser is running. Offline changes stay local and retry. A single device’s sync file can contain up to 256 MB, including attachments and recovery copies.</p><details data-drive-setup hidden><summary>Finish the one-time Google app setup</summary><p>Google sign-in has not been registered for this copy of Margin yet. The app owner completes this once. Everyone using the configured release then just chooses Continue with Google.</p><ol><li>Open Google Cloud and enable the Drive API. If Google blocks access, turn on 2-step verification for your Google account first.</li><li data-drive-client-kind>Create a Chrome Extension OAuth client using the extension ID below.</li><li>Configure this build with that public client ID, then reload Margin.</li></ol><div class="row wrap"><a class="button" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Open Google Cloud setup</a><button type="button" data-drive-copy-id>Copy extension ID</button></div><label class="field"><span data-drive-address-label>This extension’s ID</span><input data-drive-extension readonly aria-label="Extension ID"></label><a href="${esc(extension.runtime.getURL('drive-setup.html'))}" target="_blank" rel="noreferrer">Open setup instructions</a></details>`;
  content.querySelector('.page-heading').after(section);
  const q = (selector) => section.querySelector(selector);
  let state,
    updating = false;
  function render(value) {
    state = value;
    section.querySelectorAll('button').forEach((button) => (button.disabled = false));
    const connected = !!value.connected,
      busy = value.busy;
    q('[data-drive-label]').textContent = busy
      ? 'Syncing…'
      : connected
        ? value.enabled
          ? 'Automatic sync on'
          : 'Paused'
        : 'Local only';
    section.dataset.phase = busy ? 'syncing' : value.phase || 'local';
    q('[data-drive-status]').textContent =
      value.message ||
      (value.configured
        ? 'Connect when you are ready. Your library stays local until you choose to sync.'
        : 'Google sign-in is not ready in this build. The app owner must finish the one-time Google setup below.');
    q('[data-drive-account]').textContent = value.account
      ? `Google account: ${value.account.email || value.account.name}`
      : '';
    q('[data-drive-time]').textContent = value.lastSyncedAt
      ? 'Last completed sync: ' + new Date(value.lastSyncedAt).toLocaleString()
      : 'No completed sync yet.';
    q('[data-drive-connect]').hidden = connected && !['auth', 'cancelled'].includes(value.phase);
    q('[data-drive-connect]').textContent =
      connected || value.phase === 'auth' ? 'Reconnect with Google' : 'Continue with Google';
    q('[data-drive-connect]').disabled = busy;
    q('[data-drive-consent]').hidden = connected && !['auth', 'cancelled'].includes(value.phase);
    q('[data-drive-now]').hidden = !connected;
    q('[data-drive-now]').disabled = busy || !value.configured;
    q('[data-drive-toggle]').hidden = !connected;
    q('[data-drive-toggle]').textContent = value.enabled
      ? 'Pause automatic sync'
      : 'Resume automatic sync';
    q('[data-drive-toggle]').disabled = busy || !value.configured;
    q('[data-drive-disconnect]').hidden = !connected && !busy;
    q('[data-drive-disconnect]').disabled = updating;
    q('[data-drive-recovery]').hidden = !value.conflicts;
    q('[data-drive-recovery]').textContent = `Download recovery copies (${value.conflicts || 0})`;
    q('[data-drive-setup]').hidden = value.configured && value.errorCode !== 'setup';
    const web = value.authMode === 'web';
    q('[data-drive-address-label]').textContent = web
      ? 'Google callback address'
      : 'This extension’s ID';
    q('[data-drive-extension]').value = web ? value.redirectUrl : value.extensionId;
    q('[data-drive-copy-id]').textContent = web ? 'Copy callback address' : 'Copy extension ID';
    q('[data-drive-client-kind]').textContent = web
      ? 'Create a Web application OAuth client and add the callback address below to Authorized redirect URIs.'
      : 'Create a Chrome Extension OAuth client using the extension ID below.';
  }
  async function refresh() {
    if (section.isConnected && !updating) {
      const value = await api('drive-status');
      if (!state || JSON.stringify(value) !== JSON.stringify(state)) render(value);
    }
  }
  async function perform(type) {
    if (updating) return;
    updating = true;
    section.querySelectorAll('button').forEach((button) => (button.disabled = true));
    try {
      if (type === 'drive-connect') {
        if (!state?.configured) {
          const setup = q('[data-drive-setup]');
          setup.hidden = false;
          setup.open = true;
          setup.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          throw new Error(
            'Google sign-in is not registered for this build yet. Finish the one-time app setup below; no command or API key is needed for users of a configured release.',
          );
        }
        const granted = await extension.permissions.request(networkPermission([DRIVE_ORIGIN]));
        if (!granted) throw new Error('Google Drive access was not granted. Nothing was uploaded.');
      }
      render(await api(type));
    } catch (error) {
      q('[data-drive-status]').textContent = error.message;
    } finally {
      updating = false;
      // Refresh enabled states without replacing a useful inline error.
      const message = q('[data-drive-status]').textContent;
      if (state) render(state);
      q('[data-drive-status]').textContent = message;
    }
  }
  q('[data-drive-connect]').onclick = () => perform('drive-connect');
  q('[data-drive-copy-id]').onclick = async () => {
    try {
      await navigator.clipboard.writeText(
        state.authMode === 'web' ? state.redirectUrl : state.extensionId,
      );
      q('[data-drive-status]').textContent =
        state.authMode === 'web'
          ? 'Callback copied. Add it to Authorized redirect URIs in the Google Web application client.'
          : 'Extension ID copied. Use it when creating the Chrome Extension OAuth client.';
    } catch {
      q('[data-drive-extension]').select();
      q('[data-drive-status]').textContent = 'Select and copy the extension ID below.';
    }
  };
  q('[data-drive-now]').onclick = () => perform('drive-now');
  q('[data-drive-toggle]').onclick = () => perform(state?.enabled ? 'drive-pause' : 'drive-resume');
  q('[data-drive-disconnect]').onclick = () => perform('drive-disconnect');
  q('[data-drive-recovery]').onclick = async () => {
    try {
      const journal = (await get('settings', 'drive-journal'))?.value;
      download(
        'margin-sync-recovery.json',
        JSON.stringify(
          {
            format: 'margin-sync-recovery',
            version: 1,
            exportedAt: new Date().toISOString(),
            conflicts: journal?.conflicts || {},
          },
          null,
          2,
        ),
        'application/json',
      );
    } catch (error) {
      q('[data-drive-status]').textContent = error.message;
    }
  };
  refresh().catch((error) => (q('[data-drive-status]').textContent = error.message));
  const timer = setInterval(() => {
    if (!section.isConnected) {
      clearInterval(timer);
      return;
    }
    refresh().catch((error) => (q('[data-drive-status]').textContent = error.message));
  }, 2500);
}
