import { api } from './api.js';
import { extension } from './platform.js';
import { newerVersion, releasePermission, releasesUrl, releaseState } from './release-updates.js';
import { esc } from './ui.js';

const installed = extension.runtime.getManifest().version;

export async function showReleaseNotice(container) {
  if (!container) return;
  const state = await releaseState();
  const available = state.enabled && newerVersion(state.latest, installed);
  container.hidden = !available;
  container.innerHTML = available
    ? `<a class="button" href="${releasesUrl}/tag/v${esc(state.latest)}" target="_blank" rel="noreferrer">Margin ${esc(state.latest)} available ↗</a>`
    : '';
}

export function addReleaseSettings(content) {
  const section = document.createElement('section');
  section.className = 'settings-section';
  section.innerHTML = `<h2>Extension updates</h2><p>Installed version ${esc(installed)}. Enable alerts to check GitHub once a day and show a badge when a new release is available. Updates from GitHub are installed manually.</p><label class="setting-row">Check GitHub for updates<input type="checkbox" data-release-enabled disabled></label><p class="muted small" role="status" data-release-status></p><div class="row wrap"><button type="button" data-release-check disabled>Check now</button><a class="button" href="${releasesUrl}/latest" target="_blank" rel="noreferrer">View GitHub releases</a></div>`;
  content.append(section);
  const checkbox = section.querySelector('[data-release-enabled]');
  const button = section.querySelector('[data-release-check]');
  const status = section.querySelector('[data-release-status]');
  async function update(message) {
    const state = await releaseState();
    checkbox.checked = state.enabled;
    checkbox.disabled = false;
    button.disabled = !state.enabled;
    status.textContent =
      message ||
      (state.latest
        ? newerVersion(state.latest, installed)
          ? `Margin ${state.latest} is available.`
          : 'You’re up to date.'
        : '');
  }
  async function run(task) {
    checkbox.disabled = button.disabled = true;
    status.textContent = 'Checking update settings…';
    try {
      await task();
      await update();
    } catch (error) {
      await update(error.message);
    }
  }
  async function allowGitHub() {
    if (!(await extension.permissions.request(releasePermission)))
      throw new Error('GitHub access was declined. No update check was made.');
  }
  checkbox.onchange = () => {
    const enabled = checkbox.checked;
    return run(async () => {
      if (enabled) await allowGitHub();
      await api('release-enable', { enabled });
    });
  };
  button.onclick = () =>
    run(async () => {
      await allowGitHub();
      await api('release-check');
    });
  update().catch((error) => (status.textContent = error.message));
}
