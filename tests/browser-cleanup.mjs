// Native Brave on macOS can leave Playwright waiting after all assertions finish.
// This module is for standalone test processes only. A failed test must stay failed.
export async function closeTestBrowser(context, passed, timeoutMs = 15000) {
  const deadline = setTimeout(() => {
    console.error('Browser shutdown exceeded its deadline; ending the standalone test process.');
    process.exit(passed ? 0 : 1);
  }, timeoutMs);
  try {
    await context.close();
  } finally {
    clearTimeout(deadline);
  }
}
