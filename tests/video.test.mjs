import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timestampSeconds, videoId } from '../src/video.js';
test('transcript timestamps and video identities', () => {
  assert.equal(timestampSeconds('1:02:03'), 3723);
  assert.equal(timestampSeconds('02:10'), 130);
  assert.equal(timestampSeconds('bad'), 0);
  assert.equal(videoId('https://www.youtube.com/watch?v=abc&t=8'), 'abc');
  assert.equal(videoId('https://evilyoutube.com/watch?v=abc'), null);
});
