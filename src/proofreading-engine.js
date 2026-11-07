import { LocalLinter } from 'harper.js';
import { slimBinary } from 'harper.js/slimBinary';
import { proofread } from './proofreading.js';

let linter;
export function checkDraft(text) {
  linter ||= new LocalLinter({ binary: slimBinary });
  return proofread(text, linter);
}
