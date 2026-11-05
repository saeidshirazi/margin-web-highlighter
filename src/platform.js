// Firefox's browser namespace provides native promises; Chromium keeps its native chrome API.
export const extension =
  typeof globalThis.browser?.runtime?.getBrowserInfo === 'function'
    ? globalThis.browser
    : globalThis.chrome || globalThis.browser;
export const browserTarget = typeof __MARGIN_TARGET__ === 'string' ? __MARGIN_TARGET__ : 'chrome';
export const webClientId =
  typeof __MARGIN_WEB_CLIENT_ID__ === 'string' ? __MARGIN_WEB_CLIENT_ID__ : '';
const dataCategories = ['websiteContent', 'browsingActivity', 'personallyIdentifyingInfo'];
export function networkPermission(origins, categories = dataCategories) {
  return { origins, ...(browserTarget === 'firefox' ? { data_collection: categories } : {}) };
}
export async function openSidebar(tabId, api = extension) {
  // This must be called directly in a user-click handler, particularly on Firefox.
  if (api.sidebarAction?.open) return api.sidebarAction.open();
  if (api.sidePanel?.open) return api.sidePanel.open({ tabId });
  throw new Error('Open Margin’s page sidebar using your browser’s sidebar menu.');
}
