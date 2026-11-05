// The same vector geometry is used in the UI and every generated app icon.
const markPaths = `<path d="M28 27h20l16 26 16-26h20v72H79V64L64 87 49 64v35H28z" fill="#fffced"/><path d="m23 94 80-11 2 14-80 11z" fill="#d5ee8a"/>`;
export const logoSVG = (size = 128, background = true) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128" fill="none" aria-hidden="true">${background ? '<rect width="128" height="128" rx="30" fill="#173f35"/>' : ''}${markPaths}</svg>`;
