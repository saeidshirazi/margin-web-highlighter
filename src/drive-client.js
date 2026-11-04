import { extension } from './platform.js';
import { authSettings, createGoogleAuth } from './google-auth.js';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const DRIVE_ORIGIN = 'https://www.googleapis.com/*';
export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const MAX_BYTES = 256 * 1024 * 1024;
export class DriveError extends Error {
  constructor(message, code = 'network') {
    super(message);
    this.code = code;
  }
}
export function googleAuthFailure(error) {
  const message = String(error?.message || error || '');
  if (/cancel|user rejected|user denied|did not approve/i.test(message))
    return new DriveError(
      'Google sign-in was cancelled. Choose Continue with Google when you are ready.',
      'cancelled',
    );
  if (
    /invalid.?client|bad client|invalid oauth2 client|oauth2.*client.?id|client.?id.*invalid/i.test(
      message,
    )
  )
    return new DriveError(
      'Google does not recognize this copy of Margin. The app owner needs to finish Google connection setup for this extension ID.',
      'setup',
    );
  if (/not signed in|not sign.in|no signed.in|primary account/i.test(message))
    return new DriveError(
      'Sign in to your Google account in Chrome, then choose Continue with Google again.',
      'auth',
    );
  if (/access.denied|access.blocked|not granted|unverified|test user/i.test(message))
    return new DriveError(
      'Google did not allow Drive access. Approve Margin’s private Drive folder when reconnecting. For a test build, the app owner must also add your account as a Google test user.',
      'auth',
    );
  return new DriveError(
    'Google sign-in could not finish. Try Continue with Google again. If Google shows “app blocked” or “invalid client”, the app owner must finish the Google app setup.',
    'auth',
  );
}
export function googleConfigured(manifest) {
  return authSettings(manifest).configured;
}
export function createDriveClient({
  identity = extension?.identity,
  fetcher = fetch,
  signal,
  interactive = false,
  authProvider,
} = {}) {
  let token;
  const auth = authProvider || createGoogleAuth({ identity });
  async function authorize() {
    try {
      token = await auth.token(interactive);
      interactive = false;
    } catch (error) {
      if (error.kind) throw new DriveError(error.message, error.kind);
      throw googleAuthFailure(error);
    }
  }
  async function request(url, options = {}, retried = false) {
    const target = new URL(url);
    if (target.origin !== 'https://www.googleapis.com')
      throw new DriveError('Google returned an unexpected upload address.', 'invalid');
    if (!token) await authorize();
    // Each bounded request renews the extension worker's activity window.
    await globalThis.chrome?.runtime?.getPlatformInfo?.();
    let response;
    try {
      response = await fetcher(target.href, {
        ...options,
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
          : AbortSignal.timeout(25000),
        headers: { ...options.headers, Authorization: 'Bearer ' + token },
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new DriveError(
        'Google Drive could not be reached. Your data is safe locally; sync will retry when a connection is available.',
      );
    }
    if (response.status === 401 && !retried) {
      await auth.invalidate(token);
      token = undefined;
      return request(url, options, true);
    }
    if (!response.ok && response.status !== 308) {
      const messages = {
        401: 'Google sign-in expired. Reconnect Google Drive in Settings.',
        403: 'Google Drive denied access. Check Drive permission, available storage, and that the Drive API is enabled for Margin’s Google project.',
        404: 'A sync file was removed from Drive. Try Sync now again.',
        429: 'Google Drive is temporarily limiting requests. Sync will retry later.',
      };
      throw new DriveError(
        messages[response.status] ||
          'Google Drive returned an error. Local changes are kept for the next sync.',
        response.status === 401 ? 'auth' : String(response.status),
      );
    }
    return response;
  }
  return {
    async account() {
      const data = await (
        await request(DRIVE_API + '/about?fields=user(permissionId,emailAddress,displayName)')
      ).json();
      if (!data.user?.permissionId)
        throw new DriveError('Google did not return a Drive account identity.', 'auth');
      return {
        id: data.user.permissionId,
        email: data.user.emailAddress || '',
        name: data.user.displayName || 'Google account',
      };
    },
    async list() {
      const files = [];
      let pageToken;
      do {
        const params = new URLSearchParams({
          spaces: 'appDataFolder',
          q: "trashed = false and appProperties has { key='marginSync' and value='1' }",
          fields: 'nextPageToken,files(id,name,size,appProperties)',
          pageSize: '1000',
          ...(pageToken ? { pageToken } : {}),
        });
        const data = await (await request(DRIVE_API + '/files?' + params)).json();
        if (!Array.isArray(data.files))
          throw new DriveError('Google returned an unreadable file list.', 'invalid');
        files.push(...data.files);
        pageToken = data.nextPageToken;
      } while (pageToken);
      return files;
    },
    async read(file) {
      if (Number(file.size) > MAX_BYTES)
        throw new DriveError(
          'A Drive replica exceeds the 256 MB sync limit. Local data was kept. Export and reduce attachments before retrying.',
          'size',
        );
      const response = await request(
        DRIVE_API + '/files/' + encodeURIComponent(file.id) + '?alt=media',
      );
      const reader = response.body.getReader(),
        chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > MAX_BYTES)
            throw new DriveError('A Drive replica exceeds the 256 MB sync limit.', 'size');
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      try {
        return JSON.parse(await new Blob(chunks).text());
      } catch {
        throw new DriveError('A Drive sync file is unreadable. Local data was kept.', 'invalid');
      }
    },
    async write(state, fileId) {
      const bytes = new TextEncoder().encode(JSON.stringify(state));
      if (bytes.length > MAX_BYTES)
        throw new DriveError(
          'Your library exceeds the 256 MB per-device sync limit, including attachments and recovery copies. Export a backup and reduce attachments to sync it.',
          'size',
        );
      const metadata = fileId
        ? {}
        : {
            name: `margin-sync-v1-${state.device}.json`,
            mimeType: 'application/json',
            parents: ['appDataFolder'],
            appProperties: { marginSync: '1', device: state.device },
          };
      const response = await request(
        'https://www.googleapis.com/upload/drive/v3/files' +
          (fileId ? '/' + encodeURIComponent(fileId) : '') +
          '?uploadType=resumable&fields=id',
        {
          method: fileId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': 'application/json',
            'X-Upload-Content-Length': String(bytes.length),
          },
          body: JSON.stringify(metadata),
        },
      );
      const location = response.headers.get('Location');
      if (!location) throw new DriveError('Google did not provide an upload session.', 'invalid');
      const chunkSize = 4 * 1024 * 1024;
      for (let start = 0; start < bytes.length; start += chunkSize) {
        const end = Math.min(bytes.length, start + chunkSize);
        const part = await request(location, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': `bytes ${start}-${end - 1}/${bytes.length}`,
          },
          body: bytes.slice(start, end),
        });
        if (part.status !== 308) {
          if (end !== bytes.length)
            throw new DriveError('Google ended the upload early. Sync will retry.', 'invalid');
          const result = await part.json();
          if (!result.id)
            throw new DriveError('Google did not confirm the uploaded file.', 'invalid');
          return result.id;
        }
        const range = part.headers.get('Range');
        if (range !== `bytes=0-${end - 1}`)
          throw new DriveError(
            'Google accepted only part of an upload. Sync will retry safely.',
            'invalid',
          );
      }
      throw new DriveError(
        'Google did not complete the upload. Sync will retry safely.',
        'invalid',
      );
    },
  };
}
