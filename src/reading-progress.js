import { saveReadingProgress } from './db.js';
import { api } from './api.js';

export function trackReading(id, kind, getPosition, resumed = false) {
  let last = resumed ? getPosition() : undefined;
  let timer;
  const save = () => {
    clearTimeout(timer);
    const position = getPosition();
    if (position === last) return;
    last = position;
    saveReadingProgress({ id, kind, position })
      .then((changed) => {
        if (changed) api('drive-reading-changed').catch(() => {});
      })
      .catch(() => {
        if (last === position) last = undefined;
      });
  };
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(timer);
      timer = setTimeout(save, 200);
    },
    { passive: true },
  );
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  save();
}
