export function microphoneError(error) {
  const messages = {
    NotAllowedError:
      'Microphone access was denied. Allow microphone access for Margin in Chrome, then retry.',
    NotFoundError: 'No microphone was found. Connect one or choose an audio file.',
    NotReadableError:
      'The microphone is busy or unavailable. Close other recording apps and retry.',
    NotSupportedError: 'This browser cannot record audio. You can attach an existing audio file.',
  };
  return new Error(messages[error.name] || error.message || 'Could not access the microphone.');
}
export function createAudioRecorder({
  env = globalThis,
  onState = () => {},
  onComplete = () => {},
  maxMs = 5 * 60 * 1000,
  maxBytes = 20 * 1024 * 1024,
} = {}) {
  let stream,
    recorder,
    chunks = [],
    bytes = 0,
    timer,
    startTime,
    completion,
    resolveDone,
    rejectDone,
    disposed = false,
    starting = false,
    failed = false;
  const release = () => {
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };
  async function start() {
    if (starting || recorder?.state === 'recording')
      throw new Error('Recording is already active.');
    if (!env.navigator?.mediaDevices?.getUserMedia || !env.MediaRecorder)
      throw new Error('Microphone recording is unavailable. Attach an audio file instead.');
    starting = true;
    onState('requesting', 'Allow microphone access when Chrome asks.');
    try {
      stream = await env.navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed) {
        release();
        return;
      }
      const mime = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find((type) => env.MediaRecorder.isTypeSupported(type));
      recorder = new env.MediaRecorder(stream, mime ? { mimeType: mime } : {});
      failed = false;
      chunks = [];
      bytes = 0;
      startTime = Date.now();
      completion = new Promise((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
      });
      completion.catch(() => {});
      recorder.ondataavailable = (e) => {
        if (e.data?.size) {
          chunks.push(e.data);
          bytes += e.data.size;
          if (bytes > maxBytes && recorder.state === 'recording') recorder.stop();
        }
      };
      recorder.onerror = (e) => {
        failed = true;
        release();
        rejectDone?.(microphoneError(e.error || e));
        onState('error', 'Recording failed. Try attaching an audio file.');
      };
      recorder.onstop = async () => {
        release();
        if (failed) return;
        try {
          if (disposed) {
            resolveDone(null);
            return;
          }
          const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
          if (!blob.size)
            throw new Error('No audio was captured. Check the microphone or attach an audio file.');
          if (blob.size > maxBytes) throw new Error('Recording exceeds 20 MB. Use a shorter note.');
          const value = {
            blob,
            duration: Math.max(0, (Date.now() - startTime) / 1000),
            name: 'Voice note',
          };
          await onComplete(value);
          resolveDone(value);
          onState('idle', 'Recording ready. Save the note to keep it.');
        } catch (e) {
          rejectDone(e);
          onState('error', e.message);
        }
      };
      recorder.start(250);
      timer = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, maxMs);
      onState('recording', 'Recording audio locally…');
    } catch (e) {
      release();
      throw microphoneError(e);
    } finally {
      starting = false;
    }
  }
  async function stop() {
    if (starting) throw new Error('Wait for microphone access, or cancel and try again.');
    if (recorder?.state === 'recording') recorder.stop();
    const pending = completion;
    try {
      return pending ? await pending : null;
    } finally {
      if (recorder?.state !== 'recording') completion = null;
    }
  }
  function dispose() {
    disposed = true;
    release();
    if (recorder?.state === 'recording') recorder.stop();
  }
  return {
    start,
    stop,
    dispose,
    get active() {
      return starting || recorder?.state === 'recording';
    },
  };
}
