import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
const updates = {};
for (const [flag, key] of [
  ['--client-id', 'clientId'],
  ['--web-client-id', 'webClientId'],
]) {
  const index = args.indexOf(flag);
  if (index < 0) continue;
  const value = args[index + 1];
  if (!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(value || ''))
    throw new Error(`Invalid public OAuth client ID for ${flag}`);
  updates[key] = value;
}
if (!Object.keys(updates).length) {
  console.error(
    'Usage: npm run configure:google -- --client-id CHROME_CLIENT_ID.apps.googleusercontent.com --web-client-id WEB_CLIENT_ID.apps.googleusercontent.com (either or both)',
  );
  process.exit(1);
}
let previous = {};
try {
  previous = JSON.parse(await readFile('google-oauth.local.json', 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await writeFile(
  'google-oauth.local.json',
  JSON.stringify({ ...previous, ...updates }, null, 2) + '\n',
);
for (const target of ['chrome', 'edge', 'brave', 'firefox'])
  execFileSync(process.execPath, ['scripts/build.mjs', `--target=${target}`], { stdio: 'inherit' });
console.log(
  'Google OAuth configured. Reload the SAME Margin installation in your browser, then open Settings & backups → Google Drive sync. Web clients also require the native callback URLs registered in Google Cloud. Never provide a client secret.',
);
