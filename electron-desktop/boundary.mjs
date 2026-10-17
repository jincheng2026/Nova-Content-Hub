export const PAGE = 'nova-content://app/index.html';
export const CHANNELS = Object.freeze(['status', 'chooseBackup', 'chooseDestination', 'importBackup', 'resumeImport', 'listContents']);
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export function assertCaller(event, webContents, args) {
  if (!webContents || webContents.isDestroyed() || event.sender !== webContents ||
      !event.senderFrame || event.senderFrame !== webContents.mainFrame ||
      event.senderFrame.url !== PAGE || args.length !== 0) {
    throw Object.assign(new Error('该窗口无权调用此操作。'), { code: 'FORBIDDEN' });
  }
}
export function staticResource(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== 'nova-content:' || url.host !== 'app' || url.search || url.hash || url.username || url.password) return null;
  return ({ '/index.html': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] })[url.pathname] ?? null;
}
