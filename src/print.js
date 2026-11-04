import { extension } from './platform.js';
import DOMPurify from 'dompurify';
const tab = await extension.tabs.getCurrent();
const key = 'print-' + tab.id;
// The export writer may still be saving when the newly-created tab begins loading.
for (let attempt = 0; attempt < 30; attempt++) {
  const data = (await extension.storage.session.get(key))[key];
  if (data) {
    document.body.innerHTML = DOMPurify.sanitize(data, { WHOLE_DOCUMENT: false });
    const style = document.createElement('style');
    style.textContent =
      'body{max-width:780px;margin:40px auto;padding:25px;font:17px/1.7 system-ui;background:white;color:#263c32}blockquote{border-left:4px solid #ddd;margin:20px 0;padding:12px 20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}article{break-after:page}mark{-webkit-print-color-adjust:exact;print-color-adjust:exact}a{overflow-wrap:anywhere}@media print{body{margin:0;max-width:none}button{display:none!important}}';
    document.head.append(style);
    await extension.storage.session.remove(key);
    document.querySelector('#app')?.remove();
    const b = document.createElement('button');
    b.textContent = 'Print / Save as PDF';
    b.onclick = () => window.print();
    b.style.margin = '20px';
    document.body.prepend(b);
    break;
  }
  await new Promise((r) => setTimeout(r, 100));
}
