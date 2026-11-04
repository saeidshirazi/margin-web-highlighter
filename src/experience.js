// Device-only UI state. Never included in research backups or Drive replicas.
export const EXPERIENCE_KEY = 'device-experience';
export const DAY = 86400000;
export function experienceState(value = {}) {
  return {
    enabled: value.enabled !== false,
    intervalDays: [7, 14, 30].includes(value.intervalDays) ? value.intervalDays : 7,
    changeThreshold: [50, 100, 250].includes(value.changeThreshold) ? value.changeThreshold : 50,
    changes: Math.max(0, Number(value.changes) || 0),
    backedUpChanges: Math.max(0, Number(value.backedUpChanges) || 0),
    firstChangeAt: Math.max(0, Number(value.firstChangeAt) || 0),
    lastBackupAt: Math.max(0, Number(value.lastBackupAt) || 0),
    snoozedUntil: Math.max(0, Number(value.snoozedUntil) || 0),
    guideHidden: value.guideHidden === true,
    searched: value.searched === true,
  };
}
export function backupReminder(value, hasResearch, now = Date.now()) {
  const state = experienceState(value);
  const pending = Math.max(0, state.changes - state.backedUpChanges);
  const since = state.lastBackupAt || state.firstChangeAt;
  return {
    ...state,
    pending,
    due: !!(
      state.enabled &&
      hasResearch &&
      pending > 0 &&
      now >= state.snoozedUntil &&
      (pending >= state.changeThreshold || (since > 0 && now - since >= state.intervalDays * DAY))
    ),
  };
}
export function onboardingSteps(snapshot, device) {
  return [
    {
      id: 'highlight',
      label: 'Keep your first highlight',
      complete: snapshot.highlights.length > 0,
    },
    {
      id: 'note',
      label: 'Add a thought to a source or quote',
      complete:
        snapshot.pages.some((page) => page.note?.trim()) ||
        snapshot.highlights.some((item) => item.note?.trim()),
    },
    { id: 'search', label: 'Find it in your library', complete: device.searched === true },
    { id: 'backup', label: 'Download a full backup', complete: device.lastBackupAt > 0 },
  ];
}
