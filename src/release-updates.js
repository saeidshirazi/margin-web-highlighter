import { extension } from './platform.js';

const repository = 'saeidshirazi/margin-web-highlighter';
export const releasesUrl = `https://github.com/${repository}/releases`;
export const releasePermission = { origins: ['https://api.github.com/*'] };
export const releaseUpdateKey = 'releaseUpdate';
const alarmName = 'check-margin-release';

function versionParts(version) {
  return typeof version === 'string' &&
    /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){2}$/.test(version)
    ? version.split('.').map(Number)
    : null;
}

export function newerVersion(latest, installed) {
  const candidate = versionParts(latest);
  const current = versionParts(installed);
  if (!candidate || !current) return false;
  const different = candidate.findIndex((part, index) => part !== current[index]);
  return different !== -1 && candidate[different] > current[different];
}

export async function releaseState(browser = extension) {
  const saved = (await browser.storage.local.get(releaseUpdateKey))[releaseUpdateKey];
  return saved || { enabled: false };
}

export function createReleaseUpdates(browser = extension, request = globalThis.fetch) {
  const installed = browser.runtime.getManifest().version;
  let queue = Promise.resolve();
  function serialize(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  async function syncAlarmAndBadge(state) {
    if (state.enabled && (await browser.permissions.contains(releasePermission))) {
      if (!(await browser.alarms.get(alarmName)))
        await browser.alarms.create(alarmName, { periodInMinutes: 1440 });
    } else {
      await browser.alarms.clear(alarmName);
      if (state.enabled) {
        state = { enabled: false };
        await browser.storage.local.set({ [releaseUpdateKey]: state });
      }
    }
    const show = state.enabled && newerVersion(state.latest, installed);
    await browser.action.setBadgeText({ text: show ? 'UP' : '' });
  }

  async function check(state) {
    if (!state.enabled || !(await browser.permissions.contains(releasePermission)))
      throw new Error('Enable update alerts and allow access to the GitHub API first.');
    let latest;
    try {
      const response = await request(`https://api.github.com/repos/${repository}/releases/latest`, {
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('GitHub release unavailable');
      const release = await response.json();
      if (
        release.draft !== false ||
        release.prerelease !== false ||
        typeof release.tag_name !== 'string'
      )
        throw new Error('No stable GitHub release');
      latest = release.tag_name.replace(/^v/, '');
      if (!versionParts(latest) || release.tag_name !== 'v' + latest)
        throw new Error('Invalid GitHub release tag');
    } catch {
      throw new Error('Could not check GitHub for updates. Try again later.');
    }
    const result = { enabled: true, latest };
    await browser.storage.local.set({ [releaseUpdateKey]: result });
    await syncAlarmAndBadge(result);
    return result;
  }

  return {
    schedule: () => serialize(async () => syncAlarmAndBadge(await releaseState(browser))),
    onAlarm: (alarm) => {
      if (alarm.name !== alarmName) return;
      return serialize(async () => {
        const state = await releaseState(browser);
        if (state.enabled && (await browser.permissions.contains(releasePermission)))
          await check(state);
        else await syncAlarmAndBadge(state);
      });
    },
    handle: (type, payload) =>
      serialize(async () => {
        if (type === 'release-check') return check(await releaseState(browser));
        if (type !== 'release-enable' || typeof payload?.enabled !== 'boolean')
          throw new Error('Unknown update alert request.');
        const enabled = payload.enabled;
        if (enabled && !(await browser.permissions.contains(releasePermission)))
          throw new Error('Allow access to the GitHub API to enable update alerts.');
        const state = { enabled };
        await browser.storage.local.set({ [releaseUpdateKey]: state });
        await syncAlarmAndBadge(state);
        return enabled ? check(state) : state;
      }),
  };
}
