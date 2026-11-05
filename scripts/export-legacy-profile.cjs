/** Run with Electron: npx electron scripts/export-legacy-profile.cjs SOURCE_PROFILE OUTPUT.json
 * Reads only the chosen, stopped original profile. Chromium storage opens a temporary copy.
 */
const {app,BrowserWindow,protocol,session}=require('electron');
const {DatabaseSync}=require('node:sqlite');
const {existsSync,lstatSync,mkdtempSync,cpSync,rmSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {validateDocument,readLegacyStorage}=require('../app/linux/storage.cjs');
const [sourceRaw,outputRaw]=process.argv.slice(2);
if(!sourceRaw||!outputRaw){console.error('Usage: npx electron scripts/export-legacy-profile.cjs SOURCE_PROFILE OUTPUT.json');process.exit(1);}
const source=path.resolve(sourceRaw),output=path.resolve(outputRaw);
const scratch=mkdtempSync(path.join(tmpdir(),'studyvillage-legacy-export-'));
app.setPath('userData',scratch);app.setName('StudyVillage migration reader');app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'studyvillage',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
function cleanup(){rmSync(scratch,{recursive:true,force:true});}
app.on('will-quit',cleanup);
app.on('quit',cleanup);
process.once('exit',cleanup);
const bases=['secure-notes-v1','flashcard-decks-v1','quizzes-v1','group-projects-v1','whiteboards-v1','workspaces-v1','custom-assets-v1','avatar-sheet-v1','language','village-name','servers-v1','ollama-v2','review-v2','flashcard-progress-v1','role-sets','eraser-v1','hud-layout-v1','controls-v2','portrait-zoom-v1','environment-v1','interactive-objects-v1','network-v1','focus-clock-v1'];
const allowed=key=>bases.some(base=>key===`studyvillage-${base}`||(['secure-notes-v1','flashcard-decks-v1','quizzes-v1','group-projects-v1'].includes(base)&&key.startsWith(`studyvillage-${base}:room:`)));
(async()=>{
 try{
  if(existsSync(output))throw new Error('Output already exists; choose a new backup filename.');
  // A symlink can be dangling yet still identify a profile in use; don't follow or remove it.
  try{lstatSync(path.join(source,'chromium','SingletonLock'));throw new Error('Close the original app before exporting its profile.');}catch(error){if(error.code!=='ENOENT')throw error;}
  const db=new DatabaseSync(path.join(source,'studyvillage.sqlite3'),{readOnly:true});let local;
  try{const row=db.prepare('SELECT document FROM local_state WHERE id=1').get();if(!row)throw new Error('No saved local document in this profile.');local=JSON.parse(validateDocument(row.document));}finally{db.close();}
  let raw=readLegacyStorage(source);
  const chromium=path.join(source,'chromium','Local Storage');
  if(existsSync(chromium)){
   cpSync(chromium,path.join(scratch,'Local Storage'),{recursive:true});
   await app.whenReady();
   protocol.handle('studyvillage',()=>new Response('<!doctype html><title>Local migration reader</title>',{headers:{'Content-Type':'text/html','Content-Security-Policy':"default-src 'none'"}}));
   session.defaultSession.setPermissionRequestHandler((_web,_permission,done)=>done(false));
   session.defaultSession.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith('studyvillage://app/')}));
   const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
   await window.loadURL('studyvillage://app/');
   const values=await window.webContents.executeJavaScript("Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('studyvillage-')).map(key=>[key,localStorage.getItem(key)]))");
   raw={...raw,...values};window.destroy();
  }
  const values=Object.fromEntries(Object.entries(raw).filter(([key])=>allowed(key)));
  const references=Object.fromEntries(Object.entries(raw).filter(([key])=>!allowed(key)&&!['studyvillage-local-sync','studyvillage-webkit-imported'].includes(key)));
  const backup={format:'studyvillage-backup',version:1,createdAt:Date.now(),local,values,notebooks:{notebooks:[],attachments:[]},...(Object.keys(references).length?{references}:{})};
  const json=JSON.stringify(backup);if(Buffer.byteLength(json)>128*1024*1024)throw new Error('Backup exceeds 128 MiB.');
  writeFileSync(output,json,{flag:'wx',mode:0o600});console.log(`Exported ${Object.keys(values).length} libraries/settings; ${Object.keys(references).length} unmapped keys retained for reference. Source unchanged.`);
  app.quit();cleanup();
 }catch(error){console.error(error.message);cleanup();app.exit(1);}
})();
