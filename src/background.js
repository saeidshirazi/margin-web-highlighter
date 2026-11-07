import { extension, openSidebar } from './platform.js';
import * as db from './db.js';
import { canonicalUrl } from './core.js';
import { createDriveSync } from './drive-sync.js';
import { validateTranslation } from './translation.js';
import { createReleaseUpdates } from './release-updates.js';
import { checkDraft } from './proofreading-engine.js';
import { MAX_PROOFREAD_LENGTH } from './proofreading-limit.js';
let queue = Promise.resolve();
function serialize(run) {
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}
const drive = createDriveSync({ db, serialize });
const releaseUpdates = createReleaseUpdates();
const mutations = new Set([
  'save-page',
  'organize-collection',
  'move-pages',
  'undo-organization',
  'add-highlight',
  'update-highlight',
  'repair-highlight',
  'delete-highlight',
  'restore-highlight',
  'delete-page',
  'settings',
  'add-card',
  'grade-card',
  'delete-card',
  'import',
  'append-note',
  'save-audio',
  'delete-audio',
  'commit-pdf',
  'commit-import',
]);
const extensionSender = (sender) => sender.url?.startsWith(extension.runtime.getURL(''));
const translationDraftsKey = 'selectionTranslationDrafts';
async function translationDrafts() {
  const saved = (await extension.storage.session.get(translationDraftsKey))[translationDraftsKey];
  return (saved || []).filter((draft) => draft.expiresAt > Date.now());
}
async function saveTranslationDrafts(drafts) {
  if (drafts.length) await extension.storage.session.set({ [translationDraftsKey]: drafts });
  else await extension.storage.session.remove(translationDraftsKey);
}
async function handle(type, p, sender) {
  const trusted = extensionSender(sender);
  if (!trusted) {
    const allowed = [
      'page-data',
      'save-page',
      'add-highlight',
      'update-highlight',
      'note-draft',
      'repair-highlight',
      'delete-highlight',
      'restore-highlight',
      'open-library',
      'open-reader',
      'open-panel',
      'set-color',
      'open-capture',
      'open-translation',
    ];
    if (!allowed.includes(type)) throw new Error('This operation is only available in the library');
    const url = canonicalUrl(sender.url);
    if (type === 'page-data') p.url = url;
    if (type === 'save-page') {
      p = {
        url,
        title: p.title,
        bookmarked: p.bookmarked,
        article: p.article,
        text: p.text,
        byline: p.byline,
        type: p.type,
        transcript: p.transcript,
      };
    }
    if (type === 'open-capture') {
      const page =
        (await db.pageData(url)).page ||
        (await db.savePage({ url, title: p.title || sender.tab?.title || url }));
      p = { ...p, pageId: page.id, tabId: sender.tab?.id };
      if (p.highlightId && (await db.get('highlights', p.highlightId))?.pageId !== page.id)
        throw new Error('Highlight belongs to another page');
    }
    if (
      [
        'add-highlight',
        'update-highlight',
        'note-draft',
        'repair-highlight',
        'delete-highlight',
        'restore-highlight',
      ].includes(type)
    ) {
      const current = await db.pageData(url);
      const pageId =
        type === 'add-highlight'
          ? p.pageId
          : type === 'restore-highlight'
            ? p.item?.pageId
            : (await db.get('highlights', p.id))?.pageId;
      if (!current.page || current.page.id !== pageId)
        throw new Error('Highlight belongs to another page');
    }
    if (type === 'open-reader' && p.id !== (await db.pageData(url)).page?.id)
      throw new Error('Save this page first');
  }
  switch (type) {
    case 'organize-collection':
      return db.organizeCollection(p);
    case 'move-pages':
      return db.movePagesToCollection(p);
    case 'undo-organization':
      return db.undoOrganization(p);
    case 'save-export-preset':
    case 'delete-export-preset': {
      const result =
        type === 'save-export-preset'
          ? await db.saveExportPreset(p)
          : await db.deleteExportPreset(p.id);
      await db.recordResearchChange().catch(() => {});
      await extension.storage.local.set({ deviceRevision: crypto.randomUUID() });
      return result;
    }
    case 'append-note':
      return db.appendNote(p);
    case 'open-translation': {
      const text = validateTranslation(typeof p.text === 'string' ? p.text.trim() : '', 'en').text;
      const id = crypto.randomUUID();
      const previous = (await translationDrafts()).slice(0, 7);
      await saveTranslationDrafts([{ id, text, expiresAt: Date.now() + 60000 }, ...previous]);
      try {
        await extension.tabs.create({
          url: extension.runtime.getURL('capture.html') + '?translate=' + id,
        });
      } catch (error) {
        await saveTranslationDrafts(previous);
        throw error;
      }
      return;
    }
    case 'take-translation': {
      const drafts = await translationDrafts();
      const draft = drafts.find((item) => item.id === p.id);
      await saveTranslationDrafts(drafts.filter((item) => item.id !== p.id));
      if (!draft) throw new Error('This selection is no longer available. Select the text again.');
      return draft.text;
    }
    case 'open-capture': {
      const page = p.pageId
        ? await db.get('pages', p.pageId)
        : await db.savePage({
            url: p.url || 'local://note/' + crypto.randomUUID(),
            title: p.title || 'Quick note',
            type: p.url ? 'web' : 'note',
          });
      if (!page) throw new Error('This page was deleted.');
      const query = new URLSearchParams({
        id: page.id,
        mode: p.mode === 'voice' ? 'voice' : 'text',
        ...(p.highlightId ? { highlight: p.highlightId } : {}),
        ...(p.tabId ? { tab: String(p.tabId) } : {}),
      });
      return extension.tabs.create({ url: extension.runtime.getURL('capture.html') + '?' + query });
    }
    case 'preferences':
      return db.preferences();
    case 'snapshot':
      return db.snapshot();
    case 'page-data':
      return db.pageData(p.url);
    case 'save-page':
      return db.savePage(p);
    case 'add-highlight':
      return db.addHighlight(p);
    case 'update-highlight':
      return db.updateHighlight(p.id, p.patch, p.draftToken);
    case 'note-draft':
      return db.noteDraft(p.id, p);
    case 'repair-highlight':
      return db.repairHighlight(p.id, p);
    case 'device-experience':
      return db.deviceExperience();
    case 'update-experience': {
      const result = await db.deviceExperience(p);
      if (!p.searched) await extension.storage.local.set({ deviceRevision: crypto.randomUUID() });
      return result;
    }
    case 'backup-revision':
      return (await db.deviceExperience()).changes;
    case 'backup-downloaded': {
      const result = await db.recordBackupDownload(p.revision);
      await extension.storage.local.set({ deviceRevision: crypto.randomUUID() });
      return result;
    }
    case 'delete-highlight':
      return db.removeHighlight(p.id);
    case 'restore-highlight':
      return db.restoreHighlight(p.item);
    case 'delete-page':
      return db.removePage(p.id);
    case 'settings':
      return db.saveSettings(p);
    case 'set-color': {
      const settings = await db.saveSettings({ color: p.color });
      await changed();
      return settings;
    }
    case 'add-card':
      return db.addCard(p);
    case 'grade-card':
      return db.gradeCard(p.id, p.correct);
    case 'delete-card':
      return db.deleteCard(p.id);
    case 'import':
      return db.importBackup(p);
    case 'backup':
      return db.backupSnapshot();
    case 'commit-import': {
      if (!/^pending-import:[\w-]+$/.test(p.id)) throw new Error('Invalid backup transfer');
      const staged = await db.get('settings', p.id);
      if (!staged) throw new Error('The backup transfer expired. Import the file again.');
      try {
        return await db.importBackup(staged.value, { expected: p.expected });
      } finally {
        await db.deleteSetting(p.id);
      }
    }
    case 'save-audio':
      return db.saveAudioNote(p);
    case 'delete-audio':
      return db.deleteAudioNote(p.id);
    case 'commit-pdf': {
      if (!/^pending-pdf:[\w-]+$/.test(p.id)) throw new Error('Invalid PDF transfer');
      const staged = await db.get('settings', p.id);
      if (!staged) throw new Error('The PDF transfer expired. Import the file again.');
      try {
        return await db.savePDF(staged.value);
      } finally {
        await db.deleteSetting(p.id);
      }
    }
    case 'open-library':
      return extension.tabs.create({
        url:
          extension.runtime.getURL('library.html') +
          (p.id ? '#page=' + encodeURIComponent(p.id) : ''),
      });
    case 'open-reader':
      return extension.tabs.create({
        url: extension.runtime.getURL('reader.html') + '?id=' + encodeURIComponent(p.id),
      });
    case 'open-panel':
      return openSidebar(sender.tab?.id || p.tabId);
    default:
      throw new Error('Unknown request');
  }
}
async function changed() {
  await extension.storage.local.set({ revision: crypto.randomUUID() });
}
async function checkPopupNote(sender, text) {
  if (
    sender.id !== extension.runtime.id ||
    !sender.tab ||
    !/^https?:|^file:/.test(sender.url || '')
  )
    throw new Error('Open a Margin annotation on a website to proofread it.');
  if (typeof text !== 'string' || text.length > MAX_PROOFREAD_LENGTH)
    throw new Error('This draft is too large to proofread.');
  return checkDraft(text);
}
extension.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message?.type) return false;
  const run = async () => {
    const data = await handle(message.type, message.payload || {}, sender);
    if (mutations.has(message.type)) {
      // Reminder bookkeeping must not turn a successful research save into an error.
      if (message.type !== 'settings') await db.recordResearchChange().catch(() => {});
      await changed();
    }
    return data;
  };
  // Serial execution also prevents cross-tab read/modify/write races.
  const result = message.type.startsWith('drive-')
    ? extensionSender(sender)
      ? drive.handle(message.type, message.payload)
      : Promise.reject(new Error('Open Google Drive settings in the Margin library.'))
    : message.type.startsWith('release-')
      ? extensionSender(sender)
        ? releaseUpdates.handle(message.type, message.payload)
        : Promise.reject(new Error('Open Settings & backups in the Margin library.'))
      : message.type === 'proofread-note'
        ? checkPopupNote(sender, message.payload?.text)
        : serialize(run);
  result
    .then(async (data) => {
      reply({ ok: true, data });
    })
    .catch((error) => reply({ ok: false, error: error.message }));
  return true;
});
extension.alarms.onAlarm.addListener((alarm) => drive.onAlarm(alarm).catch(() => {}));
extension.alarms.onAlarm.addListener((alarm) => releaseUpdates.onAlarm(alarm)?.catch(() => {}));
extension.runtime.onStartup.addListener(() => drive.schedule().catch(() => {}));
extension.runtime.onStartup.addListener(() => releaseUpdates.schedule().catch(() => {}));
extension.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.revision) drive.schedule().catch(() => {});
});
drive.schedule().catch(() => {});
releaseUpdates.schedule().catch(() => {});
extension.runtime.onInstalled.addListener(async () => {
  await extension.contextMenus.removeAll();
  extension.contextMenus.create({
    id: 'highlight',
    title: 'Highlight with Margin',
    contexts: ['selection'],
  });
  extension.contextMenus.create({
    id: 'bookmark',
    title: 'Save page to Margin',
    contexts: ['page'],
  });
  extension.contextMenus.create({
    id: 'library',
    title: 'Open Margin library',
    contexts: ['action'],
  });
});
async function send(tabId, action) {
  try {
    await extension.tabs.sendMessage(tabId, { action });
  } catch {
    await extension.action.setBadgeText({ text: '!', tabId });
    await extension.action.setTitle({
      title: 'Open a regular web page or use the PDF viewer in the library',
      tabId,
    });
  }
}
extension.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'library')
    extension.tabs.create({ url: extension.runtime.getURL('library.html') });
  else send(tab.id, info.menuItemId);
});
extension.commands.onCommand.addListener(async (command) => {
  if (command === 'library')
    return extension.tabs.create({ url: extension.runtime.getURL('library.html') });
  const [tab] = await extension.tabs.query({ active: true, currentWindow: true });
  if (tab) send(tab.id, command);
});
