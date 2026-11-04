import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { logoSVG } from '../src/brand.js';
await mkdir('brand', { recursive: true });
await writeFile('brand/margin-icon.svg', logoSVG(512));
await sharp(Buffer.from(logoSVG(512)))
  .png()
  .toFile('brand/margin-icon.png');
for (const [theme, ink] of [
  ['light', '#173f35'],
  ['dark', '#fffced'],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="160" viewBox="0 0 680 160"><g transform="translate(12 16)">${logoSVG(128)}</g><text x="167" y="105" font-family="Arial,sans-serif" font-size="85" font-weight="700" letter-spacing="-4" fill="${ink}">margin</text></svg>`;
  await writeFile(`brand/margin-wordmark-${theme}.svg`, svg);
}
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="620"><rect width="1200" height="620" rx="20" fill="#f6f7f2"/><text x="54" y="67" font-family="Arial,sans-serif" font-size="14" letter-spacing="3" fill="#65756c">MARGIN / BRAND IDENTITY</text><rect x="40" y="105" width="550" height="365" rx="18" fill="white" stroke="#e0e6dc"/><rect x="610" y="105" width="550" height="365" rx="18" fill="#173f35"/><g transform="translate(88 170)">${logoSVG(128)}</g><text x="237" y="256" font-family="Arial,sans-serif" font-size="66" font-weight="700" letter-spacing="-3" fill="#173f35">margin</text><text x="91" y="364" font-family="Arial,sans-serif" font-size="13" letter-spacing="2" fill="#65756c">IDEAS WORTH KEEPING</text><g transform="translate(658 170)">${logoSVG(128)}</g><text x="807" y="256" font-family="Arial,sans-serif" font-size="66" font-weight="700" letter-spacing="-3" fill="#fffced">margin</text><text x="661" y="364" font-family="Arial,sans-serif" font-size="13" letter-spacing="2" fill="#b9cec1">IDEAS WORTH KEEPING</text><g transform="translate(55 510)">${logoSVG(48)}</g><g transform="translate(125 518)">${logoSVG(32)}</g><g transform="translate(179 526)">${logoSVG(16)}</g><text x="235" y="542" font-family="Arial,sans-serif" font-size="13" fill="#65756c">Drawn as a vector. Clear at toolbar size.</text><rect x="860" y="510" width="42" height="42" rx="9" fill="#173f35"/><rect x="916" y="510" width="42" height="42" rx="9" fill="#d5ee8a"/><rect x="972" y="510" width="42" height="42" rx="9" fill="#fffced" stroke="#e0e6dc"/><rect x="1028" y="510" width="42" height="42" rx="9" fill="#f6f7f2" stroke="#e0e6dc"/></svg>`;
await sharp(Buffer.from(sheet)).png().toFile('brand/brand-preview.png');
console.log('Created SVG/PNG logo kit in brand/.');
