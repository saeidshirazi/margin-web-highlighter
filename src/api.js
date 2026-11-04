import { extension } from './platform.js';
export async function api(type, payload = {}) {
  const response = await extension.runtime.sendMessage({ type, payload });
  if (!response?.ok)
    throw new Error(
      response?.error || 'Margin could not connect. Reload this tab after updating the extension.',
    );
  return response.data;
}
export function download(name, data, type = 'text/plain') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
