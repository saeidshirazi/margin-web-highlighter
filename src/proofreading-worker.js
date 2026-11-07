import { LocalLinter } from 'harper.js';
import { slimBinary } from 'harper.js/slimBinary';
import { proofread } from './proofreading.js';

const linter = new LocalLinter({ binary: slimBinary });
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ issues: await proofread(data, linter) });
  } catch {
    self.postMessage({ error: true });
  }
};
