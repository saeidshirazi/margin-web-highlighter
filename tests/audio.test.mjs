import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioRecorder, microphoneError } from '../src/audio.js';
function fixture() {
  let media,
    ended = false;
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    state = 'inactive';
    mimeType = 'audio/webm';
    constructor() {
      media = this;
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob(['sound'], { type: 'audio/webm' }) });
        this.onstop();
      });
    }
  }
  const track = {
    stop() {
      ended = true;
    },
  };
  return {
    env: {
      MediaRecorder: Recorder,
      navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } },
    },
    get ended() {
      return ended;
    },
    get media() {
      return media;
    },
  };
}
test('audio recorder stops hardware tracks and completes once with playable-container bytes', async () => {
  const f = fixture(),
    values = [];
  const recorder = createAudioRecorder({ env: f.env, onComplete: (v) => values.push(v) });
  await recorder.start();
  assert.ok(recorder.active);
  await recorder.stop();
  assert.ok(f.ended);
  assert.equal(values.length, 1);
  assert.equal(values[0].blob.size, 5);
  await recorder.stop();
  assert.equal(values.length, 1);
  recorder.dispose();
});
test('closing during a permission request stops the granted stream without recording', async () => {
  const f = fixture();
  let allow;
  f.env.navigator.mediaDevices.getUserMedia = () => new Promise((r) => (allow = r));
  const recorder = createAudioRecorder({ env: f.env });
  const pending = recorder.start();
  recorder.dispose();
  let stopped = false;
  allow({
    getTracks: () => [
      {
        stop() {
          stopped = true;
        },
      },
    ],
  });
  await pending;
  assert.ok(stopped);
  assert.ok(!f.media);
});
test('permission and missing-device errors are actionable', async () => {
  assert.match(microphoneError({ name: 'NotAllowedError' }).message, /Allow microphone/);
  assert.match(microphoneError({ name: 'NotFoundError' }).message, /No microphone/);
  const recorder = createAudioRecorder({ env: {} });
  await assert.rejects(recorder.start(), /Attach an audio/);
});
