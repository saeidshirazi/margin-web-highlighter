import path from 'node:path';
export const browserTarget = process.env.MARGIN_TEST_BROWSER || 'chrome';
if (!['chrome', 'edge', 'brave'].includes(browserTarget))
  throw new Error('Unsupported Chromium test target');
export const extensionFolder = path.resolve(
  process.env.MARGIN_TEST_EXTENSION_FOLDER ||
    (browserTarget === 'chrome' ? 'dist' : `dist-${browserTarget}`),
);
export const launchOptions =
  browserTarget === 'brave'
    ? {
        executablePath:
          process.env.MARGIN_BRAVE_BINARY ||
          'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      }
    : { channel: browserTarget === 'edge' ? 'msedge' : 'chromium' };
