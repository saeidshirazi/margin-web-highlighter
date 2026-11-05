# Free translation setup

Margin can show Google translations in its translation window through a Google Apps Script relay. Users do not need an API key. The relay is optional at build time, and the Google Translate website remains available in builds without a relay.

## Use LibreTranslate locally

Install LibreTranslate using its [installation guide](https://docs.libretranslate.com/guides/installation/). Start it with English and Persian models on your device:

```sh
libretranslate --host 127.0.0.1 --port 5000 --load-only en,fa
```

In Margin, open **Translate**, choose **LibreTranslate · runs on this device**, and allow local access. If the build has a Google relay, you can enable **Use my local LibreTranslate when Google reaches its quota**. Automatic fallback runs only on a quota response. The result shows which provider translated it.

## Configure the shared Google relay

1. Create a standalone Google Apps Script project in the account that will supply the quota. Paste [the relay source](../scripts/translation-relay.gs) into its `Code.gs` file.
2. Deploy it as a web app. Choose **Execute as me** and **Anyone** so the extension can call it without user credentials. Keep this project dedicated to translation and review its permissions before authorizing the deployment.
3. Test the `/exec` deployment URL with a non-sensitive English-to-Persian request and a Persian-to-English request. The relay expects a JSON body with `text`, `source` and `target`. Set `source` to `auto` for detection. For example:

   ```sh
   curl --location --header 'Content-Type: text/plain' \
     --data '{"text":"Hello, how are you?","source":"auto","target":"fa"}' \
     'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
   ```

4. Set `url` in [the public relay configuration](../config/translation-relay.public.json) and rebuild the browser packages. For a development build, you can use the `MARGIN_TRANSLATION_RELAY_URL` environment variable. The deployment URL is public configuration and contains no credentials.

The relay uses Google's Apps Script Language service. It caps calls at 5,000 per rolling day and shares the account's Google quotas with other scripts. Anyone who has the URL can use the shared quota, so a public deployment can run out before legitimate users are finished. Google documents the [Language service](https://developers.google.com/apps-script/reference/language/language-app), [deployment settings](https://developers.google.com/apps-script/guides/web), and [current quotas](https://developers.google.com/apps-script/guides/services/quotas).

The relay accepts up to 5,000 characters per request and stores quota counters only. Margin caches up to 64 results on the device and reuses them for up to 24 hours. Click **Clear cached translations** in the translation window to remove them.
