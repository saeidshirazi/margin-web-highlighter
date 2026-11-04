export const targets = {
  chrome: 'dist',
  edge: 'dist-edge',
  brave: 'dist-brave',
  firefox: 'dist-firefox',
};
export function browserManifest(base, target, google, ids, { publicBuild = false } = {}) {
  if (!targets[target]) throw new Error('Build target must be chrome, edge, brave, or firefox');
  const manifest = structuredClone(base);
  if (target === 'chrome') {
    const clientId = publicBuild ? '' : process.env.MARGIN_GOOGLE_CLIENT_ID || google.clientId;
    if (clientId)
      manifest.oauth2 = {
        client_id: clientId,
        scopes: ['https://www.googleapis.com/auth/drive.appdata'],
      };
    if (!publicBuild && google.extensionKey) manifest.key = google.extensionKey;
  } else {
    delete manifest.oauth2;
    // Brave shares the registered Chromium web-OAuth callback with Edge. Browser
    // profiles still have separate local databases and tokens.
    if (target === 'edge' || target === 'brave') manifest.key = ids.edgeKey;
    else {
      delete manifest.key;
      delete manifest.minimum_chrome_version;
      delete manifest.side_panel;
      manifest.permissions = manifest.permissions.filter((value) => value !== 'sidePanel');
      manifest.background = { scripts: ['background.js'], type: 'module' };
      manifest.sidebar_action = {
        default_panel: 'panel.html',
        default_title: 'Margin · Page highlights',
        default_icon: 'icons/32.png',
      };
      manifest.host_permissions = ['https://*/*', 'http://*/*', 'file:///*'];
      manifest.browser_specific_settings = {
        gecko: {
          id: ids.firefoxId,
          strict_min_version: '150.0',
          data_collection_permissions: {
            required: ['none'],
            optional: ['websiteContent', 'browsingActivity', 'personallyIdentifyingInfo'],
          },
        },
      };
    }
  }
  if (
    manifest.oauth2 &&
    !/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(manifest.oauth2.client_id)
  )
    throw new Error('Invalid Google OAuth client ID');
  return manifest;
}
