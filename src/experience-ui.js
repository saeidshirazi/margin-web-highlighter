import { extension } from './platform.js';
import { api } from './api.js';
import { backupReminder, onboardingSteps } from './experience.js';
import { esc, toast } from './ui.js';

const backupDate = (device) =>
  device.lastBackupAt ? new Date(device.lastBackupAt).toLocaleString() : 'Not yet';
let guideExpanded;
export function revealGuide() {
  guideExpanded = true;
}
export function addExperience(content, snapshot, device, { backup, refresh }) {
  const reminder = backupReminder(device, snapshot.pages.length > 0);
  const container = document.createElement('div');
  container.className = 'experience-tools';
  if (reminder.due) {
    const notice = document.createElement('section');
    notice.className = 'backup-reminder';
    notice.setAttribute('aria-label', 'Backup reminder');
    notice.innerHTML = `<div><strong>Keep a copy of your research</strong><p>${reminder.pending} changes on this device since your last backup download.</p><p class="muted small">Last full backup download: ${esc(backupDate(device))}</p></div><div class="row wrap"><button type="button" class="primary" data-backup-now>Back up now</button><button type="button" data-backup-snooze>Remind me in 7 days</button></div>`;
    notice.querySelector('[data-backup-now]').onclick = backup;
    notice.querySelector('[data-backup-snooze]').onclick = () =>
      api('update-experience', { snooze: true })
        .then(refresh)
        .catch((e) => toast(e.message));
    container.append(notice);
  }
  if (!device.guideHidden) {
    const steps = onboardingSteps(snapshot, device);
    const guide = document.createElement('details');
    guide.className = 'onboarding-guide';
    guide.open = guideExpanded ?? snapshot.pages.length === 0;
    guide.ontoggle = () => {
      if (guide.isConnected) guideExpanded = guide.open;
    };
    guide.innerHTML = `<summary><strong>Your first steps with Margin</strong><span>${steps.filter((step) => step.complete).length} of ${steps.length} complete</span></summary><p class="muted small">No account needed. Try a local practice page or highlight a sentence on any ordinary article.</p><ol class="onboarding-steps">${steps.map((step) => `<li class="${step.complete ? 'complete' : ''}"><span aria-label="${step.complete ? 'Complete' : 'Not complete'}">${step.complete ? '✓' : '○'}</span>${esc(step.label)}</li>`).join('')}</ol><div class="row wrap"><button type="button" class="primary" data-practice>Try the practice page</button><button type="button" data-first-backup ${snapshot.pages.length ? '' : 'disabled'}>Download a backup</button><button type="button" class="ghost" data-hide-guide>Hide guide</button></div><p class="muted small">Your practice highlights are real saved research. You can delete the practice source later.</p>`;
    guide.querySelector('[data-practice]').onclick = () =>
      extension.tabs.create({ url: extension.runtime.getURL('practice.html') });
    guide.querySelector('[data-first-backup]').onclick = backup;
    guide.querySelector('[data-hide-guide]').onclick = () =>
      api('update-experience', { guideHidden: true })
        .then(refresh)
        .catch((e) => toast(e.message));
    container.append(guide);
  }
  if (container.childElementCount) content.prepend(container);
}
export function addExperienceSettings(content, snapshot, device, { backup, refresh, showGuide }) {
  const section = document.createElement('section');
  section.className = 'settings-section';
  section.dataset.backupSettings = 'true';
  section.innerHTML = `<h2>Backup reminders</h2><p>Quiet reminders appear in this library after a week or enough changes. No notifications, automatic uploads, or new permissions.</p><p data-last-backup><strong>Last full backup download:</strong> ${esc(backupDate(device))}</p><p class="muted small">${Math.max(0, device.changes - device.backedUpChanges)} changes pending on this device. A download request cannot confirm that you kept the file; check your downloads before relying on a backup.</p><label class="setting-row">Show backup reminders on this device<input type="checkbox" data-backup-enabled ${device.enabled ? 'checked' : ''}></label><div class="row wrap"><label class="field">Remind after<select data-backup-days>${[7, 14, 30].map((days) => `<option value="${days}" ${days === device.intervalDays ? 'selected' : ''}>${days} days</option>`).join('')}</select></label><label class="field">Or after<select data-backup-threshold>${[50, 100, 250].map((count) => `<option value="${count}" ${count === device.changeThreshold ? 'selected' : ''}>${count} changes</option>`).join('')}</select></label></div><div class="row wrap"><button type="button" data-settings-backup ${snapshot.pages.length ? '' : 'disabled'}>Download full backup</button><button type="button" data-show-guide>Show getting-started guide</button></div><p class="muted small">Reminder dates, counters, and guide progress stay on this device. They are excluded from research backups and Drive sync. Any full JSON backup, including an encrypted one, updates the download date; research exports do not.</p>`;
  section.querySelector('[data-settings-backup]').onclick = backup;
  section.querySelector('[data-show-guide]').onclick = () =>
    api('update-experience', { guideHidden: false })
      .then(showGuide)
      .catch((e) => toast(e.message));
  for (const [selector, key, convert] of [
    ['[data-backup-enabled]', 'enabled', (element) => element.checked],
    ['[data-backup-days]', 'intervalDays', (element) => Number(element.value)],
    ['[data-backup-threshold]', 'changeThreshold', (element) => Number(element.value)],
  ])
    section.querySelector(selector).onchange = (event) =>
      api('update-experience', { [key]: convert(event.target) })
        .then(refresh)
        .catch((e) => toast(e.message));
  content.querySelector('.settings-section')?.after(section);
}
