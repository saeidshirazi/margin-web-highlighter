import assert from 'node:assert/strict';
import { test } from 'node:test';
import { downloadPDF, MAX_PDF_BYTES } from '../src/pdf-store.js';

test('PDF downloads omit credentials and accept bounded streamed data', async () => {
  const data = new TextEncoder().encode('%PDF-1.7');
  const buffer = await downloadPDF('https://example.test/document.pdf', async (_url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal);
    return new Response(data);
  });
  assert.deepEqual(new Uint8Array(buffer), data);
});

test('oversized PDF downloads cancel the response body', async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(MAX_PDF_BYTES + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: declared ? { 'Content-Length': String(MAX_PDF_BYTES + 1) } : {} },
    );
    await assert.rejects(
      downloadPDF('https://example.test/large.pdf', async () => response),
      /50 MB/,
    );
    assert.equal(cancelled, true);
  }
});
