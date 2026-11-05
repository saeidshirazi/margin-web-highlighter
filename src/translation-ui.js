import { extension, networkPermission } from './platform.js';
import { dialog, esc, toast } from './ui.js';
import { api } from './api.js';
import { LANGUAGES, languageCode, languageName, direction } from './languages.js';
import { localTranslationSupport } from './local-language-support.js';
import { clearTranslationCache } from './db.js';
import {
  freeGoogleTranslate,
  libreTranslate,
  libreTranslateOrigin,
  translationRelayOrigins,
  translationRelayUrl,
} from './translation-providers.js';
import {
  localTranslate,
  googleTranslate,
  GOOGLE_ORIGIN,
  validateTranslation,
} from './translation.js';

export async function openTranslation({ text = '', onSave } = {}) {
  const [settings, device, session] = await Promise.all([
    api('preferences'),
    extension.storage.local.get('libreTranslationFallback'),
    extension.storage.session.get('googleTranslationKey'),
  ]);
  let result,
    controller,
    requestVersion = 0;
  const options = LANGUAGES.map(
    ([code, name]) => `<option value="${code}">${esc(name)}</option>`,
  ).join('');
  const modal = dialog({
    title: 'Translate your research',
    submit: onSave ? 'Save translation to note' : 'Done',
    body: `<p class="muted small">Detect the source language, choose an output language, and keep the original text.</p><label class="field">Text to translate<textarea name="sourceText" rows="5" dir="auto">${esc(text)}</textarea></label><div class="language-pair"><label class="field">From<select name="source"><option value="auto">Detect automatically</option>${options}</select></label><label class="field">To<input name="target" list="translation-languages" aria-label="Translation output language" value="${esc(settings.translationTarget)}"><datalist id="translation-languages">${options}</datalist></label></div><div class="row wrap"><label class="small"><input type="checkbox" name="remember"> Use this output language by default</label><button type="button" data-save-language>Save language preference</button></div><label class="field" style="margin-top:18px">Translation provider<select name="provider"><option value="web">Google Translate website · no key · opens a tab</option><option value="local">On-device · browser language packs</option><option value="google">Google Cloud Translation · your API key</option></select></label><p data-local-help class="muted small">Private local processing after language-pack setup. Local support depends on your browser and language. Use the website option if unavailable.</p><div data-cloud hidden><label class="field">Google Cloud Translation API key<input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="Your key · never included in backups"></label><label class="small"><input type="checkbox" name="rememberKey" checked> Keep key until this browser session ends</label><label class="cloud-consent"><input type="checkbox" name="cloudConsent"> Send only the text above to Google Cloud for this translation. Google may charge my project.</label></div><div class="row wrap"><button type="button" data-translate class="primary">Translate</button><button type="button" data-cancel-translation hidden>Cancel translation</button><button type="button" data-google-web>Open Google Translate</button></div><p data-translation-status class="muted small" role="status" aria-live="polite"></p><label class="field">Translation<textarea name="result" rows="6" readonly dir="auto" placeholder="Your translation will appear here."></textarea></label>`,
    onSubmit: async () => {
      if (!onSave) return;
      if (!result) throw new Error('Translate the current text before saving.');
      await onSave(result);
      toast('Translation saved to your note');
    },
  });
  modal.classList.add('translation-modal');
  const query = (s) => modal.querySelector(s);
  const providerSelect = query('[name=provider]');
  providerSelect.add(new Option('LibreTranslate · runs on this device', 'libre'), 2);
  if (translationRelayUrl) {
    providerSelect.add(new Option('Google Translate · free in Margin', 'relay'), 0);
    providerSelect.value = 'relay';
  }
  query('[data-local-help]').insertAdjacentHTML(
    'beforebegin',
    `<div data-relay-help hidden><p class="muted small">Uses a shared free Google quota. Clicking Translate sends the displayed text and language choices to Google. Margin reuses recent results on this device.</p><label class="small"><input type="checkbox" name="libreFallback"> Use my local LibreTranslate when Google reaches its quota</label><button type="button" data-clear-translation-cache>Clear cached translations</button></div><p class="muted small" data-libre-help hidden>Run LibreTranslate on this device at 127.0.0.1:5000 with the languages you need. <a href="https://docs.libretranslate.com/guides/installation/" target="_blank" rel="noreferrer">LibreTranslate setup</a></p>`,
  );
  const fallback = query('[name=libreFallback]');
  const librePermission = { origins: [libreTranslateOrigin] };
  fallback.checked = device.libreTranslationFallback === true;
  query('[type=submit]').disabled = !!onSave;
  const status = (text) => {
    query('[data-translation-status]').textContent = text;
  };
  fallback.onchange = async () => {
    const enabled = fallback.checked;
    fallback.disabled = true;
    try {
      if (enabled && !(await extension.permissions.request(librePermission)))
        throw new Error('Allow access to local LibreTranslate to enable fallback.');
      await extension.storage.local.set({ libreTranslationFallback: enabled });
    } catch (error) {
      fallback.checked = !enabled;
      status(error.message);
    } finally {
      fallback.disabled = false;
    }
  };
  query('[data-clear-translation-cache]').onclick = async () => {
    try {
      await clearTranslationCache();
      status('Cached translations cleared from this device.');
    } catch (error) {
      status(error.message);
    }
  };
  const checkLocalLanguages = () => {
    if (query('[name=provider]').value !== 'local') return;
    try {
      const support = localTranslationSupport(
        query('[name=target]').value,
        query('[name=source]').value,
      );
      query('[data-translate]').disabled = !support.supported;
      if (!support.supported) status(support.message);
    } catch (error) {
      query('[data-translate]').disabled = true;
      status(error.message);
    }
  };
  if (session.googleTranslationKey) query('[name=key]').value = session.googleTranslationKey;
  const invalidate = () => {
    requestVersion++;
    controller?.abort();
    result = undefined;
    query('[name=result]').value = '';
    query('[type=submit]').disabled = !!onSave;
    query('[data-translate]').disabled = false;
    query('[data-cancel-translation]').hidden = true;
    status('');
    checkLocalLanguages();
  };
  for (const selector of ['[name=sourceText]', '[name=target]', '[name=source]'])
    query(selector).addEventListener('input', invalidate);
  query('[name=provider]').onchange = () => {
    invalidate();
    const provider = query('[name=provider]').value,
      cloud = provider === 'google';
    query('[name=result]').readOnly = provider !== 'web';
    query('[name=result]').placeholder =
      provider === 'web'
        ? 'Paste the finished translation here to save it with the original.'
        : 'Your translation will appear here.';
    query('[data-translate]').textContent =
      provider === 'web' ? 'Open Google Translate' : 'Translate';
    query('[data-google-web]').hidden = provider === 'web';
    query('[data-cloud]').hidden = !cloud;
    query('[data-local-help]').hidden = provider !== 'local';
    query('[data-relay-help]').hidden = provider !== 'relay';
    query('[data-libre-help]').hidden = provider !== 'libre';
  };
  query('[name=result]').oninput = () => {
    if (query('[name=provider]').value !== 'web') return;
    try {
      const target = languageCode(query('[name=target]').value);
      result = query('[name=result]').value.trim()
        ? {
            text: query('[name=result]').value,
            source: query('[name=source]').value,
            target,
            provider: 'Google Translate (pasted)',
          }
        : undefined;
      query('[type=submit]').disabled = !!onSave && !result;
    } catch (e) {
      status(e.message);
    }
  };
  query('[name=provider]').onchange();
  const saveLanguage = async () => {
    const target = languageCode(query('[name=target]').value);
    await api('settings', { translationTarget: target });
    status('Default output: ' + languageName(target));
  };
  query('[data-save-language]').onclick = () => saveLanguage().catch((e) => status(e.message));
  query('[data-cancel-translation]').onclick = () => {
    invalidate();
    status('Translation cancelled.');
  };
  query('[data-google-web]').onclick = async () => {
    try {
      const values = validateTranslation(
        query('[name=sourceText]').value,
        query('[name=target]').value,
        query('[name=source]').value,
      );
      if (values.text.length > 5000)
        throw new Error('Select up to 5,000 characters to open in the Google Translate website.');
      const url = new URL('https://translate.google.com/');
      url.search = new URLSearchParams({
        sl: values.source,
        tl: values.target,
        text: values.text,
        op: 'translate',
      }).toString();
      await extension.tabs.create({ url: url.href });
      status('Opened Google Translate. This text is sent to Google when the page loads.');
    } catch (e) {
      status(e.message);
    }
  };
  query('[data-translate]').onclick = async () => {
    if (query('[name=provider]').value === 'web') {
      try {
        if (query('[name=remember]').checked) await saveLanguage();
        await query('[data-google-web]').onclick();
      } catch (error) {
        status(error.message);
      }
      return;
    }
    invalidate();
    const version = requestVersion;
    const requestController = new AbortController();
    controller = requestController;
    query('[data-translate]').disabled = true;
    query('[data-cancel-translation]').hidden = false;
    try {
      const values = validateTranslation(
        query('[name=sourceText]').value,
        query('[name=target]').value,
        query('[name=source]').value,
      );

      const provider = query('[name=provider]').value;
      let completed;
      if (provider === 'google') {
        if (!query('[name=cloudConsent]').checked)
          throw new Error('Allow sending this text to Google Cloud before translating.');
        const key = query('[name=key]').value.trim();
        if (!key) throw new Error('Enter your Google Cloud Translation API key.');
        const granted = await extension.permissions.request(networkPermission([GOOGLE_ORIGIN]));
        if (!granted) throw new Error('Google API access was not granted. No text was sent.');
        if (version !== requestVersion) return;
        if (query('[name=rememberKey]').checked)
          await extension.storage.session.set({ googleTranslationKey: key });
        else await extension.storage.session.remove('googleTranslationKey');
        status('Translating with Google Cloud…');
        completed = await googleTranslate({
          ...values,
          apiKey: key,
          signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(30000)]),
        });
      } else if (provider === 'relay') {
        const granted = await extension.permissions.request(
          networkPermission(translationRelayOrigins, ['websiteContent']),
        );
        if (!granted) throw new Error('Google translation access was not granted.');
        if (version !== requestVersion) return;
        status('Translating with the free Google service…');
        completed = await freeGoogleTranslate(
          {
            ...values,
            signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(30000)]),
          },
          {
            fallback:
              fallback.checked && !fallback.disabled
                ? async (input) => {
                    if (!(await extension.permissions.contains(librePermission)))
                      throw new Error(
                        'Google’s quota is full. Choose LibreTranslate and allow local access to continue.',
                      );
                    input.signal.throwIfAborted();
                    status(
                      'Google’s quota is full. Translating with LibreTranslate on this device…',
                    );
                    return libreTranslate(input);
                  }
                : undefined,
          },
        );
      } else if (provider === 'libre') {
        const granted = await extension.permissions.request(librePermission);
        if (!granted) throw new Error('Local LibreTranslate access was not granted.');
        if (version !== requestVersion) return;
        status('Translating with LibreTranslate on this device…');
        completed = await libreTranslate({
          ...values,
          signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(30000)]),
        });
      } else
        completed = await localTranslate({
          ...values,
          signal: requestController.signal,
          progress: (message) => {
            if (version === requestVersion && modal.isConnected) status(message);
          },
        });
      if (version !== requestVersion || !modal.isConnected) return;
      if (query('[name=remember]').checked)
        await api('settings', { translationTarget: values.target });
      if (version !== requestVersion || !modal.isConnected) return;
      result = completed;
      query('[name=result]').value = result.text;
      query('[name=result]').dir = direction(result.target);
      query('[name=result]').scrollIntoView({ block: 'nearest' });
      query('[type=submit]').disabled = false;
      status(
        (result.source === 'auto'
          ? 'Automatic source detection'
          : (values.source === 'auto' ? 'Detected source: ' : 'Source: ') +
            languageName(result.source)) +
          ' → ' +
          languageName(result.target) +
          ' · ' +
          result.provider +
          (result.cached ? ' · local cache' : ''),
      );
    } catch (e) {
      if (version === requestVersion && modal.isConnected) {
        result = undefined;
        status(
          e.name === 'AbortError'
            ? 'Translation cancelled.'
            : e.name === 'TimeoutError'
              ? 'Translation timed out. Try a shorter passage or check your connection.'
              : e.message,
        );
      }
    } finally {
      if (version === requestVersion && modal.isConnected) {
        query('[data-translate]').disabled = false;
        query('[data-cancel-translation]').hidden = true;
        checkLocalLanguages();
      }
    }
  };
  modal.addEventListener(
    'close',
    () => {
      requestVersion++;
      controller?.abort();
    },
    { once: true },
  );
  return modal;
}
