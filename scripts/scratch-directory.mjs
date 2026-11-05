import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function scratchDirectory(purpose) {
  const directory = await mkdtemp(path.join(tmpdir(), `margin-${purpose}-`));
  return {
    path: directory,
    [Symbol.asyncDispose]() {
      return rm(directory, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
