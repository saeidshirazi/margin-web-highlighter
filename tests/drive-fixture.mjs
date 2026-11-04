import { createServer } from 'node:http';
import assert from 'node:assert/strict';
export const files = new Map(),
  sessions = new Map(),
  calls = [];
export const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }
  try {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const request = JSON.parse(Buffer.concat(chunks).toString()),
      url = new URL(request.url);
    calls.push({ method: request.method, path: url.pathname });
    assert.equal(request.headers.Authorization, 'Bearer fixture-only-no-google-access');
    let data,
      status = 200,
      headers = {};
    if (url.pathname.endsWith('/about'))
      data = {
        user: {
          permissionId: 'fixture-account',
          emailAddress: 'reader@example.test',
          displayName: 'Test reader',
        },
      };
    else if (url.searchParams.has('upload_id')) {
      const session = sessions.get(url.searchParams.get('upload_id'));
      const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(request.headers['Content-Range']);
      session.chunks.push(Buffer.from(request.body.bytes));
      if (Number(range[2]) + 1 < Number(range[3])) {
        status = 308;
        headers.Range = 'bytes=0-' + range[2];
      } else {
        files.set(session.id, {
          ...session.metadata,
          id: session.id,
          data: JSON.parse(Buffer.concat(session.chunks).toString()),
        });
        data = { id: session.id };
      }
    } else if (url.searchParams.get('uploadType') === 'resumable') {
      const id = request.method === 'PATCH' ? url.pathname.split('/').pop() : crypto.randomUUID();
      const uploadId = crypto.randomUUID(),
        metadata = request.method === 'PATCH' ? files.get(id) : JSON.parse(request.body.text);
      sessions.set(uploadId, { id, metadata, chunks: [] });
      headers.Location = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=' + uploadId;
    } else if (url.searchParams.get('alt') === 'media')
      data = files.get(url.pathname.split('/').pop()).data;
    else {
      assert.equal(url.searchParams.get('spaces'), 'appDataFolder');
      data = {
        files: [...files.values()].map((file) => ({
          id: file.id,
          name: file.name,
          appProperties: file.appProperties,
          size: String(JSON.stringify(file.data).length),
        })),
      };
    }
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(data === undefined ? '' : JSON.stringify(data));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});
