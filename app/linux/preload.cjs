const { contextBridge, ipcRenderer } = require('electron');
// These fixed operations expose no file paths, SQL, Node APIs or generic IPC.
// WebKit and Chromium have different localStorage formats. Copy missing keys
// once, before application modules read notes/whiteboards/settings. Never delete
// or modify the WebKit source, and never replace existing Chromium values.
let migrationError;
try { if (!localStorage.getItem('studyvillage-webkit-imported')) {
  const legacy = ipcRenderer.sendSync('local:legacy');
  if (legacy.error) throw new Error(legacy.error);
  for (const [key, value] of Object.entries(legacy.values)) {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }
  localStorage.setItem('studyvillage-webkit-imported', '1');
} } catch (error) { migrationError = String(error); }
contextBridge.exposeInMainWorld('studyVillageDesktop', {
  loadLocal: () => migrationError ? Promise.reject(new Error(migrationError)) : ipcRenderer.invoke('local:load'),
  saveLocal: json => migrationError ? Promise.reject(new Error(migrationError)) : ipcRenderer.invoke('local:save', json),
  openExternal: url => ipcRenderer.invoke('external:open', url),
});

function saveServerProfile(profile){
 if(!profile||typeof profile.url!=='string'||typeof profile.name!=='string')return;
 const key='studyvillage-servers-v1';let list=[];try{list=JSON.parse(localStorage.getItem(key)||'[]');}catch{}
 if(!Array.isArray(list))list=[];list=list.filter(item=>typeof item?.url==='string'&&item.url!==profile.url).slice(0,19);
 localStorage.setItem(key,JSON.stringify([profile,...list]));
}
try{saveServerProfile(ipcRenderer.sendSync('server:launch-profile'));}catch{}
ipcRenderer.on('server:profile',(_event,profile)=>{try{saveServerProfile(profile);window.dispatchEvent(new Event('studyvillage-server-profile'));}catch{}});
