const { app, BrowserWindow, protocol, net, ipcMain, session, dialog, shell, desktopCapturer } = require('electron');
const path = require('node:path');
const {serverProfileFromArgs}=require('./server-profile.cjs');
let launchProfile=null;try{launchProfile=serverProfileFromArgs(process.argv);}catch(error){console.error(error.message);}
const { pathToFileURL } = require('node:url');
const { openStore, readLegacyStorage } = require('./storage.cjs');
const ORIGIN = 'studyvillage://app';
const trusted = url => { try { const u = new URL(url); return u.protocol === 'studyvillage:' && u.host === 'app'; } catch { return false; } };
const dataDir = process.env.STUDYVILLAGE_TEST_DATA_DIR || path.join(process.platform==='linux' ? (process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local/share')) : app.getPath('appData'), 'local.studyvillage.rebuild');
app.setName('StudyVillage Rebuild');
app.setPath('userData', path.join(dataDir, 'chromium'));
protocol.registerSchemesAsPrivileged([{ scheme: 'studyvillage', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' wss: ws://127.0.0.1:* ws://localhost:* ws://[::1]:* http://127.0.0.1:11434 https:; frame-src blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
let window, store;
function trustedEvent(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== event.sender.mainFrame || !trusted(event.senderFrame.url)) throw new Error('Untrusted caller');
}
async function openExternal(url) {
  if (typeof url !== 'string' || url.length > 2048 || /[\s\x00-\x1f"]/.test(url)) throw new Error('Invalid link');
  const u = new URL(url);
  if (u.username || u.password || !(u.protocol === 'https:' || (u.protocol === 'vscode:' && u.host === 'vscode.git' && u.pathname === '/clone' && u.searchParams.has('url')))) throw new Error('Unsupported link');
  await shell.openExternal(url);
}
function createWindow() {
  window = new BrowserWindow({ width: 1400, height: 940, minWidth: 900, minHeight: 680, title: 'StudyVillage', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  window.removeMenu();
  window.webContents.on('will-navigate', (event, url) => { if (!trusted(url)) { event.preventDefault(); void openExternal(url).catch(() => {}); } });
  window.webContents.setWindowOpenHandler(({ url }) => { void openExternal(url).catch(() => {}); return { action: 'deny' }; });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.loadURL(`${ORIGIN}/`);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event,argv) => { try{const profile=serverProfileFromArgs(argv);if(profile)window?.webContents.send('server:profile',profile);}catch(error){console.error(error.message);} if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    const root = path.resolve(__dirname, 'web');
    protocol.handle('studyvillage', async request => {
      const url = new URL(request.url);
      if (!trusted(request.url) || !['GET', 'HEAD'].includes(request.method)) return new Response('Forbidden', { status: 403 });
      let filename;
      try { filename = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { return new Response('Bad request', { status: 400 }); }
      if (!filename.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
      try { const response = await net.fetch(pathToFileURL(filename).href); const headers = new Headers(response.headers); headers.set('Content-Security-Policy', csp); headers.set('X-Content-Type-Options', 'nosniff'); return new Response(response.body, { status: response.status, headers }); }
      catch { return new Response('Not found', { status: 404 }); }
    });
    store = openStore(path.join(dataDir, 'studyvillage.sqlite3'));
    ipcMain.handle('local:load', event => { trustedEvent(event); return store.load(); });
    ipcMain.handle('local:save', (event, json) => { trustedEvent(event); store.save(json); });
    ipcMain.handle('external:open', (event, url) => { trustedEvent(event); return openExternal(url); });
    ipcMain.on('server:launch-profile',event=>{try{trustedEvent(event);event.returnValue=launchProfile;launchProfile=null;}catch{event.returnValue=null;}});
    ipcMain.on('local:legacy', event => { try { trustedEvent(event); event.returnValue = { values: readLegacyStorage(dataDir) }; } catch { event.returnValue = { error: 'Could not import existing local settings; original preserved.' }; } });
    // Querying support is not a grant: each media request gets its own prompt.
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin) => contents === window?.webContents && trusted(origin) && permission === 'clipboard-sanitized-write');
    session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      if (contents !== window?.webContents || !trusted(details.requestingUrl) || !['media', 'clipboard-sanitized-write'].includes(permission)) return callback(false);
      if (permission === 'clipboard-sanitized-write') return callback(true);
      const types = details.mediaTypes?.join(', ') || 'microphone/camera';
      const result = await dialog.showMessageBox(window, { type: 'question', title: 'StudyVillage', message: `Allow access to ${types}? / ¿Permitir acceso a ${types}?`, buttons: ['Cancel / Cancelar', 'Allow / Permitir'], defaultId: 0, cancelId: 0 });
      callback(result.response === 1);
    });
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      if (request.frame !== window?.webContents.mainFrame || !trusted(request.securityOrigin) || !request.userGesture) return callback({});
      try {
        const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
        if (!sources.length) return callback({});
        const result = await dialog.showMessageBox(window, { title: 'Share screen / Compartir pantalla', message: 'Choose what to share / Elige qué compartir', buttons: ['Cancel / Cancelar', ...sources.map(s => s.name)], cancelId: 0, defaultId: 0 });
        callback(result.response > 0 ? { video: sources[result.response - 1] } : {});
      } catch { callback({}); }
    }, { useSystemPicker: true });
    session.defaultSession.on('will-download', (event, item, contents) => {
      if (contents !== window?.webContents || !trusted(contents.getURL()) || !item.getURL().startsWith(`blob:${ORIGIN}/`)) return event.preventDefault();
      item.setSaveDialogOptions({ title: 'Save file / Guardar archivo', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
      item.on('done', (_event, state) => { if (state === 'interrupted') dialog.showErrorBox('StudyVillage', 'The download failed. Try again. / No se pudo guardar el archivo. Vuelve a intentarlo.'); });
    });
    createWindow();
  }).catch(error => { dialog.showErrorBox('StudyVillage', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => store?.close());
}
