import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReleaseUpdates, newerVersion, releasePermission } from '../src/release-updates.js';

test('release versions are ordered by numeric components', () => {
  assert.equal(newerVersion('0.10.0', '0.9.12'), true);
  assert.equal(newerVersion('0.9.1', '0.9.1'), false);
  assert.equal(newerVersion('0.9.0', '0.9.1'), false);
  assert.equal(newerVersion('1.0.0-beta', '0.9.1'), false);
});

test('update checks require opt-in and permission, and alert only for newer stable releases', async () => {
  const storage = {};
  let allowed = false;
  let alarm;
  let badge;
  let requests = 0;
  let release = { tag_name: 'v0.10.0', draft: false, prerelease: false };
  const browser = {
    runtime: { getManifest: () => ({ version: '0.9.1' }) },
    storage: {
      local: { get: async () => storage, set: async (patch) => Object.assign(storage, patch) },
    },
    permissions: {
      contains: async (permission) => {
        assert.deepEqual(permission, releasePermission);
        return allowed;
      },
    },
    alarms: {
      get: async () => alarm,
      create: async (name, options) => {
        alarm = { name, ...options };
      },
      clear: async () => {
        alarm = undefined;
      },
    },
    action: {
      setBadgeText: async ({ text }) => {
        badge = text;
      },
    },
  };
  const updates = createReleaseUpdates(browser, async (url, options) => {
    requests++;
    assert.equal(
      url,
      'https://api.github.com/repos/saeidshirazi/margin-web-highlighter/releases/latest',
    );
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    return { ok: true, json: async () => release };
  });
  await updates.schedule();
  await assert.rejects(updates.handle('release-enable', { enabled: true }), /Allow access/);
  await assert.rejects(updates.handle('release-check'), /Enable update alerts/);
  assert.equal(requests, 0);
  allowed = true;
  assert.deepEqual(await updates.handle('release-enable', { enabled: true }), {
    enabled: true,
    latest: '0.10.0',
  });
  assert.equal(alarm.periodInMinutes, 1440);
  assert.equal(badge, 'UP');
  release = { ...release, prerelease: true };
  await assert.rejects(updates.onAlarm(alarm), /Could not check GitHub/);
  assert.equal(badge, 'UP');
  release = { tag_name: 'v0.9.1', draft: false, prerelease: false };
  await updates.onAlarm(alarm);
  assert.equal(badge, '');
  release = { ...release, tag_name: 'v0.10.0' };
  await updates.handle('release-check');
  const scheduled = alarm;
  assert.equal(badge, 'UP');
  allowed = false;
  await updates.schedule();
  await updates.onAlarm(scheduled);
  assert.equal(requests, 4);
  assert.equal(alarm, undefined);
  assert.equal(badge, '');
  assert.deepEqual(storage.releaseUpdate, { enabled: false });
});
