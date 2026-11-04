import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backupReminder,
  experienceState,
  DAY,
  EXPERIENCE_KEY,
  onboardingSteps,
} from '../src/experience.js';
import * as db from '../src/db.js';

test('reminders require research and pending changes, respect time/count, snooze and opt-out', () => {
  const now = 20 * DAY;
  const old = { changes: 1, firstChangeAt: now - 8 * DAY };
  assert.equal(backupReminder(old, true, now).due, true);
  assert.equal(backupReminder(old, false, now).due, false);
  assert.equal(backupReminder({ ...old, changes: 0 }, true, now).due, false);
  assert.equal(backupReminder({ ...old, enabled: false }, true, now).due, false);
  assert.equal(backupReminder({ ...old, snoozedUntil: now + DAY }, true, now).due, false);
  assert.equal(backupReminder({ ...old, snoozedUntil: now - 1 }, true, now).due, true);
  assert.equal(backupReminder({ changes: 50, firstChangeAt: now }, true, now).due, true);
  assert.equal(backupReminder({ changes: 49, firstChangeAt: now }, true, now).due, false);
  assert.equal(backupReminder({ ...old, backedUpChanges: 1 }, true, now).due, false);
  assert.equal(backupReminder({ ...old, lastBackupAt: now - DAY }, true, now).due, false);
  assert.equal(experienceState({ intervalDays: 1, changeThreshold: 1 }).intervalDays, 7);
});

test('backup acknowledgement preserves changes made during export; device state stays out of backups and imports', async () => {
  await db.deviceExperience({ guideHidden: true, searched: true, intervalDays: 14 });
  await db.recordResearchChange();
  const revision = (await db.deviceExperience()).changes;
  await db.recordResearchChange();
  await db.recordBackupDownload(revision);
  const status = await db.deviceExperience();
  assert.equal(status.changes - status.backedUpChanges, 1);
  await db.recordBackupDownload(revision - 1);
  assert.equal((await db.deviceExperience()).backedUpChanges, revision);
  await assert.rejects(() => db.recordBackupDownload(revision + 10), /Invalid backup/);
  const backup = await db.backupSnapshot();
  assert.ok(!JSON.stringify(backup).includes(EXPERIENCE_KEY));
  assert.equal(backup.settings.guideHidden, undefined);
  assert.equal(backup.settings.lastBackupAt, undefined);
  const beforeImport = await db.deviceExperience();
  await db.importBackup({
    ...backup,
    settings: { ...backup.settings, guideHidden: false, lastBackupAt: 1 },
  });
  assert.equal((await db.deviceExperience()).guideHidden, true);
  assert.equal((await db.deviceExperience()).lastBackupAt, beforeImport.lastBackupAt);
  await db.deleteSetting(EXPERIENCE_KEY);
  await db.savePage({ url: 'https://example.test/existing-library', title: 'Existing research' });
  const upgraded = await db.deviceExperience();
  assert.equal(upgraded.changes, 1);
  assert.ok(upgraded.firstChangeAt > 0);
  assert.equal((await db.deviceExperience()).firstChangeAt, upgraded.firstChangeAt);
});

test('repair preserves identity, notes/cards/audio and original quotation, rejects stale edits and malformed anchors', async () => {
  const page = await db.savePage({ url: 'https://example.test/repair', title: 'Repair' });
  const old = await db.addHighlight({
    pageId: page.id,
    text: 'Old quote',
    anchor: { exact: 'Old quote', start: 0, end: 9, prefix: '', suffix: '' },
    note: 'Keep my note',
    tags: ['keep'],
    color: '#ffe08a',
  });
  const card = await db.addCard({
    pageId: page.id,
    highlightId: old.id,
    question: 'Keep card',
    answer: 'Answer',
  });
  await db.saveAudioNote({
    id: 'audio:repair',
    pageId: page.id,
    highlightId: old.id,
    type: 'audio/webm',
    base64: 'YWJj',
    name: 'Voice',
    createdAt: 1,
  });
  const replacement = {
    text: 'New passage',
    anchor: { exact: 'New passage', start: 5, end: 16, prefix: 'Intro', suffix: 'After' },
    expectedUpdatedAt: old.updatedAt,
  };
  const repaired = await db.repairHighlight(old.id, replacement);
  assert.equal(repaired.id, old.id);
  assert.equal(repaired.note, old.note);
  assert.deepEqual(repaired.tags, old.tags);
  assert.equal(repaired.color, old.color);
  assert.equal(repaired.originalText, old.text);
  assert.equal(repaired.repairHistory[0].anchor.exact, old.text);
  assert.equal((await db.get('cards', card.id)).highlightId, old.id);
  assert.equal((await db.get('assets', 'audio:repair')).highlightId, old.id);
  await assert.rejects(() => db.repairHighlight(old.id, replacement), /changed in another/);
  await assert.rejects(
    () =>
      db.repairHighlight(old.id, {
        ...replacement,
        anchor: { ...replacement.anchor, exact: 'Mismatch' },
      }),
    /replacement passage/,
  );
  assert.equal((await db.get('highlights', old.id)).text, 'New passage');
  for (let index = 0; index < 12; index++) {
    const current = await db.get('highlights', old.id);
    await db.repairHighlight(old.id, { ...replacement, expectedUpdatedAt: current.updatedAt });
  }
  const final = await db.get('highlights', old.id);
  assert.equal(final.repairHistory.length, 10);
  assert.equal(final.originalText, 'Old quote');
  const backup = await db.backupSnapshot();
  await db.importBackup(backup);
  assert.equal((await db.get('highlights', old.id)).originalText, 'Old quote');
  const malformed = structuredClone(backup);
  malformed.highlights.find((item) => item.id === old.id).repairHistory = 'invalid';
  await assert.rejects(() => db.importBackup(malformed), /repair history/);
  assert.equal((await db.get('highlights', old.id)).originalText, 'Old quote');
  await db.removeHighlight(old.id);
  await assert.rejects(
    () => db.repairHighlight(old.id, { ...replacement, expectedUpdatedAt: final.updatedAt }),
    /deleted/,
  );
});

test('the getting-started checklist reflects real highlights, notes, search and backup progress', () => {
  const snapshot = { pages: [], highlights: [] };
  assert.equal(onboardingSteps(snapshot, {}).filter((step) => step.complete).length, 0);
  const steps = onboardingSteps(
    { pages: [{ note: 'A thought' }], highlights: [{ note: '' }] },
    { searched: true, lastBackupAt: 10 },
  );
  assert.ok(steps.every((step) => step.complete));
});
