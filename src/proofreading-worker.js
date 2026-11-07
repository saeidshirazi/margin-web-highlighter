import { checkDraft } from './proofreading-engine.js';

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ issues: await checkDraft(data) });
  } catch {
    self.postMessage({ error: true });
  }
};
