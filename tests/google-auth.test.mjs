import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuth, validateAuthRedirect, authSettings } from '../src/google-auth.js';
const clientId = '123-test.apps.googleusercontent.com',
  redirect = 'https://test.chromiumapp.org/';
const scope = 'https://www.googleapis.com/auth/drive.appdata';
test('Edge, Brave and Firefox use web OAuth with state, exact redirects, expiring session tokens and no secret', async () => {
  for (const target of ['edge', 'brave', 'firefox']) {
    const cache = {},
      calls = [];
    const storage = {
      get: async () => cache,
      set: async (values) => Object.assign(cache, values),
      remove: async (key) => delete cache[key],
    };
    const identity = {
      getRedirectURL: () => redirect,
      launchWebAuthFlow: async (options) => {
        const url = new URL(options.url);
        calls.push(options);
        assert.equal(url.origin, 'https://accounts.google.com');
        assert.equal(url.searchParams.get('scope'), scope);
        assert.equal(url.searchParams.get('response_type'), 'token');
        assert.equal(url.searchParams.get('client_secret'), null);
        assert.ok(url.searchParams.get('state').length >= 64);
        return (
          redirect +
          '#' +
          new URLSearchParams({
            access_token: 'fixture-token',
            token_type: 'Bearer',
            expires_in: '3600',
            scope,
            state: url.searchParams.get('state'),
          })
        );
      },
    };
    const auth = createGoogleAuth({ target, clientId, identity, storage, now: () => 100 });
    assert.equal(await auth.token(true), 'fixture-token');
    assert.equal(await auth.token(false), 'fixture-token');
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).searchParams.get('prompt'), 'select_account');
    await auth.invalidate('fixture-token');
    await auth.token(false);
    assert.equal(new URL(calls[1].url).searchParams.get('prompt'), 'none');
    await auth.disconnect();
    assert.deepEqual(cache, {});
  }
});
test('OAuth rejects forged redirects, wrong state, denied scope and malformed tokens', () => {
  const fragment = '#access_token=secret&token_type=Bearer&expires_in=3600&state=correct';
  assert.throws(
    () => validateAuthRedirect('https://attacker.test/' + fragment, redirect, 'correct'),
    /unexpected/,
  );
  assert.throws(() => validateAuthRedirect(redirect + fragment, redirect, 'wrong'), /verified/);
  assert.throws(
    () =>
      validateAuthRedirect(redirect + '#state=correct&error=access_denied', redirect, 'correct'),
    /cancelled/,
  );
  assert.throws(
    () => validateAuthRedirect(redirect + fragment + '&scope=openid', redirect, 'correct'),
    /usable/,
  );
  assert.throws(
    () => validateAuthRedirect(redirect + fragment.replace('3600', 'NaN'), redirect, 'correct'),
    /usable/,
  );
  assert.equal(
    authSettings({ oauth2: { client_id: clientId, scopes: [scope] } }, 'edge', '').configured,
    false,
  );
  assert.equal(authSettings({}, 'firefox', clientId).mode, 'web');
});
