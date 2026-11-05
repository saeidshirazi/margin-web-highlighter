const TRANSLATION_QUOTA = 5000;
const TRANSLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function doPost(event) {
  let input;
  try {
    const body = event.postData.contents;
    if (body.length > 64000) return reply_('invalid');
    input = JSON.parse(body);
  } catch (_) {
    return reply_('invalid');
  }
  const language = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
  if (
    typeof input?.text !== 'string' ||
    !input.text.trim() ||
    [...input.text].length > 5000 ||
    typeof input.source !== 'string' ||
    (input.source !== 'auto' && !language.test(input.source)) ||
    typeof input.target !== 'string' ||
    !language.test(input.target) ||
    input.target === 'auto'
  )
    return reply_('invalid');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return reply_('busy');
  try {
    const properties = PropertiesService.getScriptProperties();
    const now = Date.now();
    let quota = JSON.parse(properties.getProperty('translationQuota') || 'null');
    if (!quota || quota.resetAt <= now) quota = { count: 0, resetAt: now + TRANSLATION_WINDOW_MS };
    if (quota.count >= TRANSLATION_QUOTA) return reply_('quota');
    quota.count++;
    properties.setProperty('translationQuota', JSON.stringify(quota));
  } finally {
    lock.releaseLock();
  }

  try {
    const text = LanguageApp.translate(
      input.text,
      input.source === 'auto' ? '' : input.source,
      input.target,
    );
    return reply_('', text);
  } catch (error) {
    return reply_(
      /(?:too many times for one day|daily quota|limit exceeded).*translat/i.test(String(error))
        ? 'quota'
        : 'failed',
    );
  }
}

function reply_(code, text) {
  return ContentService.createTextOutput(
    JSON.stringify(code ? { ok: false, code } : { ok: true, text }),
  ).setMimeType(ContentService.MimeType.JSON);
}
