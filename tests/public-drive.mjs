import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['tests/drive-e2e.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MARGIN_TEST_BROWSER: 'chrome',
    MARGIN_TEST_EXTENSION_FOLDER: 'work/public-chrome',
    MARGIN_TEST_PUBLIC_OAUTH: '1',
  },
});
