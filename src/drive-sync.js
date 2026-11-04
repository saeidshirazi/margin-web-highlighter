import { createDriveClient, DRIVE_ORIGIN, googleConfigured, DriveError } from './drive-client.js';
import { extension, networkPermission } from './platform.js';
import { authSettings, createGoogleAuth } from './google-auth.js';
import {
  captureState,
  emptyState,
  mergeStates,
  projectState,
  validateState,
  stableJSON,
} from './sync-state.js';

export const SYNC_ALARM = 'margin-drive-periodic';
export const DIRTY_ALARM = 'margin-drive-pending';
export function createDriveSync({
  db,
  serialize,
  chromeApi = extension,
  clientFactory = createDriveClient,
} = {}) {
  let running, controller;
  const config = async () => (await chromeApi.storage.local.get('driveSync')).driveSync || {};
  async function update(patch) {
    const value = { ...(await config()), ...patch };
    await chromeApi.storage.local.set({ driveSync: value });
    return value;
  }
  async function status() {
    const value = await config();
    return {
      ...value,
      configured: googleConfigured(chromeApi.runtime.getManifest()),
      extensionId: chromeApi.runtime.id,
      busy: !!running,
      authMode: authSettings(chromeApi.runtime.getManifest()).mode,
      redirectUrl: chromeApi.identity?.getRedirectURL?.() || '',
    };
  }
  async function checkpoint() {
    const backup = await db.backupSnapshot();
    const previous = (await db.get('settings', 'drive-journal'))?.value || emptyState();
    const state = await captureState(backup, previous);
    await db.put('settings', { id: 'drive-journal', value: state });
    return { backup, state };
  }
  async function run(interactive) {
    const settings = await config();
    if (!googleConfigured(chromeApi.runtime.getManifest()))
      throw new Error(
        'Google Drive setup is needed for this build. Open the setup instructions in Settings.',
      );
    if (!(await chromeApi.permissions.contains(networkPermission([DRIVE_ORIGIN]))))
      throw new DriveError(
        'Google Drive access is not enabled. Choose Connect Google Drive in Settings.',
        'auth',
      );
    controller.signal.throwIfAborted();
    await update({
      phase: interactive ? 'connecting' : 'syncing',
      errorCode: '',
      message: interactive ? 'Connecting to Google…' : 'Checking Google Drive…',
    });
    const client = clientFactory({ signal: controller.signal, interactive });
    const account = await client.account();
    if (settings.boundAccount && account.id !== settings.boundAccount)
      throw new Error(
        'This local library is linked to a different Google account. Reconnect that account or use a separate browser profile to keep accounts separate.',
      );
    await update({
      connected: true,
      ...(interactive ? { enabled: true } : {}),
      boundAccount: account.id,
      account,
      phase: 'syncing',
      message: 'Merging your library with Google Drive…',
    });
    if ((await config()).enabled) await chromeApi.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
    const initial = await serialize(checkpoint);
    const files = await client.list(),
      remotes = [];
    for (const file of files) remotes.push(await validateState(await client.read(file)));
    let state;
    await serialize(async () => {
      controller.signal.throwIfAborted();
      // Capture edits made while network requests were in progress before applying remote records.
      const latest = await checkpoint();
      controller.signal.throwIfAborted();
      state = mergeStates(latest.state, ...remotes);
      const merged = projectState(state, latest.backup);
      // Validation happens before the atomic data + journal transaction.
      await db.applySyncedBackup(merged, state);
      if (stableJSON(merged) !== stableJSON({ ...latest.backup, exportedAt: undefined }))
        await chromeApi.storage.local.set({ revision: crypto.randomUUID() });
    });
    controller.signal.throwIfAborted();
    const own = files.find((file) => file.appProperties?.device === initial.state.device);
    await update({
      message: 'Saving your library to Google Drive…',
      conflicts: Object.keys(state.conflicts).length,
    });
    await client.write(state, own?.id);
    await update({
      phase: 'ready',
      lastSyncedAt: Date.now(),
      message: 'Your library is synced.',
      conflicts: Object.keys(state.conflicts).length,
    });
  }
  async function start(interactive = false) {
    if (running) return status();
    if (!interactive && !(await config()).connected) throw new Error('Connect Google Drive first.');
    if (running) return status();
    controller = new AbortController();
    running = run(interactive)
      .catch(async (error) => {
        if (controller?.signal.aborted) return;
        await update({
          errorCode: error.code || '',
          phase:
            error.code === 'auth' || error.code === 'setup'
              ? 'auth'
              : error.code === 'cancelled'
                ? 'cancelled'
                : 'error',
          message: error.message || 'Sync could not finish. Your data is safe locally.',
        });
      })
      .finally(() => {
        running = undefined;
        controller = undefined;
      });
    return status();
  }
  async function schedule() {
    const value = await config();
    if (value.connected && value.enabled) {
      await chromeApi.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
      if (!(await chromeApi.alarms.get(DIRTY_ALARM)))
        await chromeApi.alarms.create(DIRTY_ALARM, { delayInMinutes: 0.5 });
    }
  }
  async function handle(type) {
    if (type === 'drive-status') return status();
    if (type === 'drive-connect') return start(true);
    if (type === 'drive-now') return start();
    if (type === 'drive-pause' || type === 'drive-disconnect') {
      controller?.abort();
      await running;
      await update({
        enabled: false,
        ...(type === 'drive-disconnect' ? { connected: false } : {}),
        phase: 'paused',
        message:
          type === 'drive-disconnect'
            ? 'Disconnected. Local data and the existing Drive copy are kept.'
            : 'Automatic sync paused. Your library stays available locally.',
      });
      await chromeApi.alarms.clear(SYNC_ALARM);
      await chromeApi.alarms.clear(DIRTY_ALARM);
      if (type === 'drive-disconnect')
        await createGoogleAuth({
          identity: chromeApi.identity,
          storage: chromeApi.storage.session,
        }).disconnect();
      return status();
    }
    if (type === 'drive-resume') {
      await update({ enabled: true });
      await schedule();
      return start();
    }
    if (type === 'drive-conflicts') {
      const state = (await db.get('settings', 'drive-journal'))?.value;
      return {
        format: 'margin-sync-recovery',
        version: 1,
        exportedAt: new Date().toISOString(),
        conflicts: state?.conflicts || {},
      };
    }
    throw new Error('Unknown Google Drive operation');
  }
  async function onAlarm(alarm) {
    if (![SYNC_ALARM, DIRTY_ALARM].includes(alarm.name)) return;
    const value = await config();
    if (value.connected && value.enabled) await start();
  }
  return { handle, status, schedule, onAlarm, idle: () => running };
}
