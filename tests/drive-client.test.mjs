import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDriveClient,
  DRIVE_SCOPE,
  DRIVE_API,
  googleConfigured,
  googleAuthFailure,
} from '../src/drive-client.js';
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers });
const identity = () => ({
  getAuthToken: async () => ({ token: 'fake-token', grantedScopes: [DRIVE_SCOPE] }),
  removeCachedAuthToken: async () => {},
});
test('Drive retries an expired token once and never exposes provider response secrets', async () => {
  let calls = 0,
    removals = 0;
  const auth = identity();
  auth.removeCachedAuthToken = async ({ token }) => {
    assert.equal(token, 'fake-token');
    removals++;
  };
  const client = createDriveClient({
    identity: auth,
    fetcher: async (url, options) => {
      assert.ok(url.startsWith(DRIVE_API));
      assert.equal(options.headers.Authorization, 'Bearer fake-token');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      return ++calls === 1
        ? json({ secret: 'never-show-me' }, 401)
        : json({ user: { permissionId: 'account-a', emailAddress: 'reader@example.test' } });
    },
  });
  assert.equal((await client.account()).id, 'account-a');
  assert.equal(removals, 1);
  assert.equal(calls, 2);
  const denied = createDriveClient({
    identity: identity(),
    fetcher: async () => json({ secret: 'never-show-me' }, 403),
  });
  await assert.rejects(
    denied.account(),
    (error) => /denied/.test(error.message) && !error.message.includes('never-show-me'),
  );
});
test('Drive requests only app-data scope and paginates files in the app-data folder', async () => {
  const auth = identity();
  auth.getAuthToken = async (options) => {
    assert.deepEqual(options.scopes, [DRIVE_SCOPE]);
    return { token: 'fake-token', grantedScopes: [DRIVE_SCOPE] };
  };
  let calls = 0;
  const client = createDriveClient({
    identity: auth,
    fetcher: async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('spaces'), 'appDataFolder');
      assert.ok(parsed.searchParams.get('q').includes('marginSync'));
      calls++;
      return json({
        files: [{ id: String(calls) }],
        ...(calls === 1 ? { nextPageToken: 'next' } : {}),
      });
    },
  });
  assert.equal((await client.list()).length, 2);
  const denied = createDriveClient({
    identity: { getAuthToken: async () => ({ token: 'fake-token', grantedScopes: [] }) },
  });
  await assert.rejects(denied.account(), /did not allow Drive access/);
  assert.ok(
    googleConfigured({
      oauth2: { client_id: '123-abc.apps.googleusercontent.com', scopes: [DRIVE_SCOPE] },
    }),
  );
  assert.equal(googleConfigured({}), false);
});
test('resumable uploads use bounded chunks and require a final Drive confirmation', async () => {
  let chunks = 0;
  const state = { device: 'device-a', data: 'a'.repeat(5 * 1024 * 1024) };
  const client = createDriveClient({
    identity: identity(),
    fetcher: async (url, options) => {
      if (options.method === 'POST') {
        assert.deepEqual(JSON.parse(options.body).parents, ['appDataFolder']);
        return new Response(null, {
          status: 200,
          headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=fake' },
        });
      }
      assert.equal(options.method, 'PUT');
      assert.ok(options.body.byteLength <= 4 * 1024 * 1024);
      chunks++;
      const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(options.headers['Content-Range']);
      return Number(range[2]) + 1 === Number(range[3])
        ? json({ id: 'file-a' })
        : new Response(null, { status: 308, headers: { Range: 'bytes=0-' + range[2] } });
    },
  });
  assert.equal(await client.write(state), 'file-a');
  assert.equal(chunks, 2);
});
test('unexpected upload hosts and oversized downloads are rejected before data transfer', async () => {
  let requests = 0;
  const client = createDriveClient({
    identity: identity(),
    fetcher: async () => {
      requests++;
      return new Response(null, { headers: { Location: 'https://example.test/steal' } });
    },
  });
  await assert.rejects(client.write({ device: 'a' }), /unexpected upload address/);
  assert.equal(requests, 1);
  await assert.rejects(client.read({ id: 'large', size: 300 * 1024 * 1024 }), /256 MB/);
  assert.equal(requests, 1);
});

test('Google sign-in distinguishes cancellation, missing app registration, and account errors', () => {
  assert.equal(googleAuthFailure(new Error('The user did not approve access.')).code, 'cancelled');
  assert.equal(googleAuthFailure(new Error('Invalid OAuth2 Client ID')).code, 'setup');
  assert.match(googleAuthFailure(new Error('Invalid OAuth2 Client ID')).message, /app owner/);
  assert.match(
    googleAuthFailure(new Error('The user is not signed in.')).message,
    /Sign in to your Google account in Chrome/,
  );
  assert.equal(googleAuthFailure(new Error('access_denied')).code, 'auth');
});
