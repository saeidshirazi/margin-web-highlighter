import { extension, browserTarget, webClientId } from './platform.js';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SESSION_KEY = 'marginGoogleWebToken';
const validClient = (value) => /^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(value || '');
export class GoogleAuthError extends Error {
  constructor(message, kind = 'auth') {
    super(message);
    this.kind = kind;
  }
}
export function authSettings(manifest, target = browserTarget, clientId = webClientId) {
  const native =
    target === 'chrome' &&
    validClient(manifest.oauth2?.client_id) &&
    manifest.oauth2.scopes?.includes(SCOPE);
  return target === 'chrome'
    ? { configured: !!native, mode: 'native', clientId: manifest.oauth2?.client_id || '' }
    : { configured: validClient(clientId), mode: 'web', clientId };
}
export function validateAuthRedirect(returned, redirect, state) {
  let url, expected;
  try {
    url = new URL(returned);
    expected = new URL(redirect);
  } catch {
    throw new GoogleAuthError('Google returned an invalid sign-in response.');
  }
  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.username ||
    url.password
  )
    throw new GoogleAuthError('Google returned an unexpected sign-in address.');
  const values = new URLSearchParams(url.hash.slice(1));
  if (!state || values.get('state') !== state)
    throw new GoogleAuthError(
      'The Google sign-in response could not be verified. Please reconnect.',
    );
  if (values.get('error'))
    throw new GoogleAuthError(
      'Google sign-in was cancelled or permission was not granted.',
      'cancelled',
    );
  const token = values.get('access_token'),
    seconds = Number(values.get('expires_in'));
  if (
    !token ||
    values.get('token_type')?.toLowerCase() !== 'bearer' ||
    !Number.isFinite(seconds) ||
    seconds < 1 ||
    seconds > 86400 ||
    (values.has('scope') && !values.get('scope').split(' ').includes(SCOPE))
  )
    throw new GoogleAuthError(
      'Google did not return a usable Drive permission. Reconnect and allow Margin’s private Drive folder.',
    );
  return { token, seconds };
}
export function createGoogleAuth({
  identity = extension?.identity,
  storage = extension?.storage?.session,
  target = browserTarget,
  clientId = webClientId,
  now = Date.now,
} = {}) {
  return {
    async token(interactive = false) {
      if (target === 'chrome' && identity?.getAuthToken) {
        const result = await identity.getAuthToken({
          interactive,
          scopes: [SCOPE],
          enableGranularPermissions: true,
        });
        if (!result.token || (result.grantedScopes && !result.grantedScopes.includes(SCOPE)))
          throw new Error('Drive permission was not granted');
        return result.token;
      }
      if (!validClient(clientId))
        throw new GoogleAuthError(
          'The app owner must register Google web sign-in for this browser. Chrome’s OAuth client cannot be reused for Edge, Brave, or Firefox.',
          'setup',
        );
      if (!identity?.launchWebAuthFlow || !identity.getRedirectURL || !storage)
        throw new GoogleAuthError('This browser does not provide the secure Google sign-in flow.');
      const redirect = identity.getRedirectURL();
      const cached = (await storage.get(SESSION_KEY))[SESSION_KEY];
      if (
        cached?.clientId === clientId &&
        cached.redirect === redirect &&
        cached.expiresAt > now() + 60000
      )
        return cached.token;
      const random = crypto.getRandomValues(new Uint8Array(32));
      const state = [...random].map((value) => value.toString(16).padStart(2, '0')).join('');
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: 'token',
        scope: SCOPE,
        state,
        prompt: interactive ? 'select_account' : 'none',
      }).toString();
      const returned = await identity.launchWebAuthFlow({ interactive, url: url.href });
      const result = validateAuthRedirect(returned, redirect, state);
      await storage.set({
        [SESSION_KEY]: {
          token: result.token,
          expiresAt: now() + result.seconds * 1000,
          clientId,
          redirect,
        },
      });
      return result.token;
    },
    async invalidate(token) {
      if (target === 'chrome' && identity?.removeCachedAuthToken)
        await identity.removeCachedAuthToken({ token });
      await storage?.remove(SESSION_KEY);
    },
    async disconnect() {
      await storage?.remove(SESSION_KEY);
      if (target === 'chrome') await identity?.clearAllCachedAuthTokens?.();
    },
  };
}
