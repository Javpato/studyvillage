import { createBackup,parseBackup as parseAppBackup,previewBackup,restoreBackup as restoreAppBackup,recoverInterruptedRestore,previousBackup } from '../../packages/runtime/src/storage/backup';
import { exportIdentityTransfer, unlockIdentityTransfer } from '../../packages/runtime/src/storage/identity-transfer';
import { sharePublicContact } from '../../packages/runtime/src/local-bridge/contact-share';
import { pruneDoorPositions } from './house/space-draw';
import { errorMessage, userError } from './errors/messages';
import { t } from './i18n';
import { getAvatarCustomization, setAvatarCustomization } from './assets/custom-assets';
import { appearanceSchema } from './assets/appearance';
import { installWardrobe } from './house/wardrobe';
import { decryptIdentity, encryptIdentity, exportContact, generateIdentity, parseContact, validatePublicIdentity } from '../../packages/core/src/identity';
import { VillageClient } from '../../packages/runtime/src/session/client';
import { ServerVillageClient, checkServer, serverHttpUrl } from '../../packages/runtime/src/server/client';
import type { BoardStroke } from '../../packages/core/src/protocol/types';
import { createStudyUI } from './ui/app';
import { MediaDiagnostic } from './diagnostics/media-diagnostic';
import { chooseLocalFile, downloadLocal, showLocalPreview } from '../../packages/runtime/src/local-bridge/files';
import { newLocalData, openLocalStore, publicHouse, SaveQueue, type LocalData } from '../../packages/runtime/src/storage/local-store';
import type { AppActions, AppMessage, AppView, PublicHouse, CameraActivity } from '../../packages/core/src/protocol/types';

const activePhases = new Set(['SIGNALING', 'CONNECTING', 'AUTHENTICATING', 'PENDING_APPROVAL', 'JOINED', 'RECONNECTING']);
function initialHouse(ownerId: string): PublicHouse {
  return { ownerId, revision: 1, name: 'Mi rincón de estudio', access: 'ask', theme: 'mint', furniture: [
    { id: 'clock', kind: 'clock', x: 65, y: 270, publicAlias: 'Reloj de concentración' },
    { id: 'jukebox', kind: 'jukebox', x: 140, y: 270, publicAlias: 'Jukebox de estudio' },
    { id: 'guide', kind: 'guide', x: 600, y: 285, publicAlias: 'Guía de la casa' },
    { id: 'inkdesk', kind: 'inkdesk', x: 240, y: 270, publicAlias: 'Cuaderno de tinta' },
    { id: 'desk', kind: 'desk', x: 130, y: 150, publicAlias: 'Mi proyecto' },
    { id: 'library', kind: 'bookshelf', x: 55, y: 100, publicAlias: 'Lecturas' },
    { id: 'board', kind: 'board', x: 340, y: 95, publicAlias: 'Ideas compartidas' },
    { id: 'table', kind: 'table', x: 430, y: 240, publicAlias: 'Mesa de estudio' },
    { id: 'plant', kind: 'plant', x: 660, y: 120, publicAlias: 'Un poco de verde' },
    { id: 'frame', kind: 'frame', x: 560, y: 100, publicAlias: 'Inspiración' },
  ] };
}

export async function startApp(root: HTMLElement): Promise<() => void> {
  const store = await openLocalStore();
  await recoverInterruptedRestore(store);
  const loaded = await store.load();
  let data: LocalData = loaded ?? newLocalData();
  // A saved identity is never silently used without unlocking its private key.
  let identity = await generateIdentity(data.profile.displayName, data.profile.color);
  let lockedIdentity = !!data.encryptedIdentity;
  let ownHouse = data.house ? publicHouse(data.house, identity.public.fingerprint) : initialHouse(identity.public.fingerprint);
  if (data.profile.appearance) setAvatarCustomization(data.profile.appearance);
  const wardrobeMigration = !data.profile.wardrobeAdded;
  if (wardrobeMigration) {
    ownHouse = installWardrobe(ownHouse);
    if (ownHouse.furniture.some(f => f.kind === 'cabinet')) data.profile.wardrobeAdded = true;
  }
  let client: VillageClient | ServerVillageClient = new VillageClient(identity, ownHouse, { appearance: getAvatarCustomization(), mailboxLocalAlias: !data.encryptedIdentity, mailboxPreviousOwner: data.house?.ownerId });
  let network = client.view;
  let notice: string | null = lockedIdentity ? 'Desbloquea tu identidad guardada para conectar. Tu casa sigue disponible sin conexión.' : null;
  let closed = false;
  let ui: ReturnType<typeof createStudyUI> | null = null;
  let savingFailed = false;
  const update = () => {
    if (closed) return;
    const view: AppView = { identity: identity.public, network, ownHouse, contacts: data.contacts,
      friendCode: data.friendCode, storage: store.kind, identitySaved: !!data.encryptedIdentity,
      lockedIdentity, notice, diagnostics: diagnostic.entries, editorText: data.editor };
    ui?.update(view);
  };
  const diagnostic = new MediaDiagnostic(update);
  const report = (error: unknown) => {
    const message = errorMessage(error);
    notice = message; update();
  };
  const writes = new SaveQueue(store, error => { savingFailed = true; report(error); });
  const localHouseSnapshot=()=>publicHouse(ownHouse,data.encryptedIdentity?.publicIdentity.fingerprint??ownHouse.ownerId);
  const persist = async () => {
    savingFailed = false;
    data = { ...data, house: localHouseSnapshot() };
    await writes.save(data);
  };
  let unsubscribe = () => {};
  let cameraActivity:CameraActivity|null='village';
  // Activity listeners belong to the UI and outlive any one client.
  const appListeners = new Set<(message: AppMessage) => void>();
  const subscribe = () => {
    client.setCameraActivity(cameraActivity);
    const offView = client.subscribe(view => { network = view; update(); });
    const offApp = client.onApp(message => { for (const listener of appListeners) listener(message); });
    unsubscribe = () => { offView(); offApp(); };
  };
  const replaceClient = () => { unsubscribe(); client.dispose(); client = new VillageClient(identity, ownHouse, { appearance: getAvatarCustomization(), mailboxLocalAlias: !data.encryptedIdentity, mailboxPreviousOwner: data.house?.ownerId }); subscribe(); };
  const serverClient = () => { if (!(client instanceof ServerVillageClient)) throw userError(t('Conéctate primero a un servidor.')); return client; };
  const requireOffline = () => { if (activePhases.has(network.phase)) throw new Error('Sal del vecindario antes de cambiar tu identidad o perfil.'); };
  const requireUnlocked = () => { if (lockedIdentity) throw new Error('Desbloquea tu identidad guardada antes de conectar.'); };
  const run = async (action: () => void | Promise<void>) => { try { await action(); } catch (error) { report(error); throw error; } };
  const runSync = (action: () => void) => { try { action(); } catch (error) { report(error); } };

  const actions: AppActions = {
    openVillage: () => run(async () => { requireUnlocked(); diagnostic.stop(); await client.openVillage(); }),
    joinVillage: invite => run(async () => { requireUnlocked(); diagnostic.stop(); await client.joinVillage(invite); }),
    decideJoin: (id, accept) => runSync(() => client.decideJoin(id, accept)),
    rotateInvite: () => runSync(() => client.rotateInvite()),
    leave: () => run(async () => { diagnostic.stop(); const wasServer = client instanceof ServerVillageClient; await client.leave(); await writes.flush(); if (wasServer) { replaceClient(); update(); } }),
    checkServer: url => checkServer(url),
    connectServer: (url, options) => run(async () => {
      requireOffline();
      // A locked saved identity must be unlocked first; a temporary identity may only visit.
      if (lockedIdentity) throw new Error('Desbloquea tu identidad guardada antes de conectar.');
      const address = serverHttpUrl(url);
      diagnostic.stop(); unsubscribe(); client.dispose();
      client = new ServerVillageClient(identity, ownHouse, { url: address, saved: !!data.encryptedIdentity, invite: options.invite || undefined, claim: options.claim || undefined, appearance: getAvatarCustomization() });
      subscribe();
      try { await client.connect(); }
      catch (error) { const failed = client; replaceClient(); failed.dispose(); notice = errorMessage(error); update(); throw error; }
      update();
    }),
    serverRequest: body => serverClient().request(body),
    travel: neighborhood => run(() => serverClient().travel(neighborhood)),
    importToServer: (boards: { ref: string; strokes: BoardStroke[] }[]) => serverClient().importOwn(boards),
    visitHouse: id => runSync(() => client.visitHouse(id)),
    cancelAccessRequest: () => client.cancelAccessRequest(),
    decideVisit: (id, accept) => runSync(() => client.decideVisit(id, accept)),
    leaveHouse: () => runSync(() => client.leaveHouse()),
    publishHouse: house => runSync(() => client.publishHouse(publicHouse(house, identity.public.fingerprint))),
    move: position => client.move(position),
    selectBoard: ref => runSync(() => client.selectBoard(ref)),
    commitBoard: (ref, changes) => client.commitBoard(ref, changes),
    sendStroke: stroke => runSync(() => client.sendStroke(stroke)),
    deleteStroke: id => runSync(() => client.deleteStroke(id)),
    kickMember: id => runSync(() => client.kickMember(id)),
    kickVisitor: id => runSync(() => client.kickVisitor(id)),
    toggleMicrophone: () => run(() => client.toggleMicrophone()),
    setMuted: muted => client.setMuted(muted),
    setDeafened: deafened => client.setDeafened(deafened),
    setPushToTalk: enabled => client.setPushToTalk(enabled),
    setTalking: talking => client.setTalking(talking),
    startScreen: () => run(() => client.startScreen()),
    stopScreen: () => client.stopScreen(),
    setCameraActivity: activity => {cameraActivity=activity;client.setCameraActivity(activity);},
    setGameCameraPolicy: policy => client.setGameCameraPolicy?.(policy),
    selectMediaDevice: id => client.selectMediaDevice?.(id),
    toggleGameCamera: () => run(() => client.toggleGameCamera()),
    updateAppearance: appearance => run(async () => {
      const next = appearanceSchema.parse(appearance); const previous = data.profile.appearance;
      data.profile.appearance = next; await persist();
      if (savingFailed) { data.profile.appearance = previous; throw new Error('No se pudo guardar el look. Vuelve a intentarlo.'); }
      setAvatarCustomization(next); await client.updateAppearance(next); update();
    }),
    workspaceCommand: command => client.workspaceCommand(command),
    mailboxCommand: async command => { if(lockedIdentity)throw userError(t('Desbloquea tu identidad guardada para abrir el buzón.')); return client.mailboxCommand(command); },
    voiceCommand: command => client.voiceCommand(command),
    requestPrivate: (identityId) => client.requestPrivate(identityId),
    sendApp: (channel, to, data) => client.sendApp(channel, to, data),
    onApp: listener => { appListeners.add(listener); return () => { appListeners.delete(listener); }; },
    updateProfile: (displayName, color) => run(async () => {
      requireOffline();
      const name = displayName.trim().slice(0, 32);
      if (!name || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Elige un nombre y un color válidos.');
      data.profile = { ...data.profile, displayName: name, color };
      identity.public = { ...identity.public, displayName: name, color };
      replaceClient(); await persist(); update();
    }),
    saveHouseLayout: house => run(async () => {
      if(house.ownerId!==identity.public.fingerprint)throw new Error('Solo puedes decorar tu propia casa.');
      let next=publicHouse(pruneDoorPositions(house));
      next.revision=Math.max(next.revision,ownHouse.revision+1);
      if(client instanceof ServerVillageClient)next=await client.saveHouseLayout(next);
      else client.publishHouse(next);
      ownHouse=next;await persist();update();
      if(savingFailed)throw userError(t('No se pudo guardar en este dispositivo. Inténtalo de nuevo.'));
    }),
    updateOwnHouse: house => runSync(() => {
      if (house.ownerId !== identity.public.fingerprint) throw new Error('Solo puedes decorar tu propia casa.');
      // Decoration must not overwrite access lists saved by another device.
      const authoritative=network.serverHouse;
      const next = publicHouse(authoritative?{...house,floors:authoritative.floors,allowlist:authoritative.allowlist,doorPositions:authoritative.doorPositions,access:house.access===ownHouse.access?authoritative.access:house.access}:house);
      if(authoritative)next.revision=Math.max(next.revision,authoritative.revision+1);
      if (next.revision <= ownHouse.revision) next.revision = ownHouse.revision + 1;
      ownHouse = next;
      data.projectLinks = Object.fromEntries(Object.entries(data.projectLinks).filter(([id]) => ownHouse.furniture.some(item => item.id === id)));
      client.publishHouse(ownHouse); void persist(); update();
    }),
    copyInvite: () => run(async () => {
      if (!network.invite) throw new Error('Abre primero un vecindario.');
      try { await navigator.clipboard.writeText(network.invite); notice = 'Invitación copiada. Compártela solo con quien quieras invitar.'; }
      catch { notice = 'El portapapeles no está disponible. Selecciona y copia la invitación del campo de texto.'; }
      update();
    }),
    saveIdentity: passphrase => run(async () => {
      requireOffline(); requireUnlocked();
      if (passphrase.length < 12) throw new Error('Usa una contraseña de al menos 12 caracteres.');
      const encrypted = await encryptIdentity(identity, passphrase);
      const previous = data.encryptedIdentity;
      data.encryptedIdentity = encrypted; await persist();
      if (savingFailed) { data.encryptedIdentity = previous; throw new Error('No se pudo guardar la identidad. Comprueba el almacenamiento local.'); }
      replaceClient();
      notice = 'Identidad guardada cifrada. Necesitarás esta contraseña al reiniciar.';
      update();
    }),
    exportBackup: () => run(async()=>{
      await writes.flush();const backup=JSON.stringify(await createBackup({...data,house:localHouseSnapshot()}));
      if(new TextEncoder().encode(backup).length>128*1024*1024)throw userError(t('La copia supera 128 MiB.'));
      downloadLocal('studyvillage-backup.json',new Blob([backup],{type:'application/json'}));
    }),
    inspectBackup: async file=>{if(file.size>128*1024*1024)throw userError(t('La copia supera 128 MiB.'));return previewBackup(await parseAppBackup(await file.text()),await createBackup({...data,house:localHouseSnapshot()}));},
    restoreBackup: file=>run(async()=>{
      requireOffline();if(file.size>128*1024*1024)throw userError(t('La copia supera 128 MiB.'));
      const backup=await parseAppBackup(await file.text());await writes.flush();
      await restoreAppBackup(backup,{...data,house:localHouseSnapshot()},store);location.reload();
    }),
    exportRecoveryBackup:()=>run(async()=>{
      const backup=await previousBackup();if(!backup)throw userError(t('Todavía no hay una copia anterior a la restauración.'));
      downloadLocal('studyvillage-before-restore.json',new Blob([JSON.stringify(backup)],{type:'application/json'}));
    }),
    exportIdentity: () => run(async()=>{
      if(!data.encryptedIdentity)throw userError(t('Guarda primero tu identidad cifrada.'));
      downloadLocal('studyvillage-identity.json',new Blob([exportIdentityTransfer(data.encryptedIdentity)],{type:'application/json'}));
    }),
    importIdentity: (file,passphrase) => run(async()=>{
      requireOffline();if(file.size>16384)throw userError(t('La copia de identidad supera 16 KiB.'));
      const imported=await unlockIdentityTransfer(await file.text(),passphrase);
      const previous={data,identity,ownHouse,lockedIdentity};
      identity=imported.identity;lockedIdentity=false;ownHouse=publicHouse(ownHouse,identity.public.fingerprint);
      data={...data,encryptedIdentity:imported.encrypted,profile:{...data.profile,displayName:identity.public.displayName,color:identity.public.color}};
      await persist();
      if(savingFailed){({data,identity,ownHouse,lockedIdentity}=previous);throw userError(t('No se pudo guardar la identidad. Comprueba el almacenamiento local.'));}
      replaceClient();notice=t('Identidad importada y verificada.');update();
    }),
    unlockIdentity: passphrase => run(async () => {
      requireOffline(); if (!data.encryptedIdentity) throw new Error('No hay ninguna identidad guardada.');
      const unlocked = await decryptIdentity(data.encryptedIdentity, passphrase);
      identity = { ...unlocked, public: { ...unlocked.public, ...data.profile } };
      ownHouse = publicHouse(ownHouse, identity.public.fingerprint); lockedIdentity = false;
      replaceClient(); await persist(); notice = 'Identidad desbloqueada; tus contactos pueden reconocer tu huella.'; update();
    }),
    addSessionContact: id => run(async () => {
      const person=network.phase==='JOINED'?(network.members.find(m=>m.connected&&m.identity.fingerprint===id)?.identity??network.voiceDirectory?.find(p=>p.fingerprint===id)):undefined;
      if(!person||id===identity.public.fingerprint)throw userError(t('Esa persona ya no está en la sesión.'));
      if(data.contacts.some(c=>c.identity.fingerprint===id))return;
      if(data.contacts.length>=100)throw new Error('La agenda admite hasta 100 contactos.');
      const verified=await validatePublicIdentity(person);
      if(data.contacts.some(c=>c.identity.fingerprint===id))return;
      if(data.contacts.length>=100)throw new Error('La agenda admite hasta 100 contactos.');
      data.contacts=[...data.contacts,{schemaVersion:1,identity:verified}];await persist();update();
    }),
    setContactNickname: (id,nickname) => run(async () => {
      const name=nickname.trim();if(name.length>48)throw userError(t('El apodo admite hasta 48 caracteres.'));
      data.contacts=data.contacts.map(c=>c.identity.fingerprint===id?{...c,nickname:name}:c);await persist();update();
    }),
    shareContact: () => run(async () => {
      requireUnlocked();
      try{
        const result=await sharePublicContact(exportContact(identity,data.friendCode));
        if(result==='downloaded'){notice=t('Tarjeta descargada. Adjúntala en WhatsApp como documento.');update();}
      }catch{throw userError(t('No se pudo abrir WhatsApp. Puedes exportar la tarjeta y adjuntarla como documento.'));}
    }),
    exportContact: () => runSync(() => {
      requireUnlocked();
      downloadLocal('studyvillage-contact.json', new Blob([exportContact(identity, data.friendCode)], { type: 'application/json' }));
      if (!data.encryptedIdentity) { notice = 'Contacto exportado. Guarda tu identidad cifrada para conservar esta huella al reiniciar.'; update(); }
    }),
    importContact: file => run(async () => {
      if (file.size > 8192) throw new Error('El archivo de contacto supera 8 KiB.');
      const contact = await parseContact(await file.text());
      if (contact.identity.fingerprint === identity.public.fingerprint) throw new Error('Este contacto eres tú.');
      const existing = data.contacts.filter(item => item.identity.fingerprint !== contact.identity.fingerprint);
      if (existing.length >= 100) throw new Error('La agenda admite hasta 100 contactos.');
      const nickname=data.contacts.find(c=>c.identity.fingerprint===contact.identity.fingerprint)?.nickname;
      data.contacts = [...existing, {...contact,...(nickname?{nickname}:{})}]; await persist(); notice = 'Contacto importado y huella verificada. Una invitación temporal sigue siendo necesaria para conectar.'; update();
    }),
    rotateFriendCode: () => { data.friendCode = crypto.randomUUID(); void persist(); notice = 'Código amigo renovado. Tu identidad y huella se conservan.'; update(); },
    openLocalFile: furnitureId => run(async () => {
      const item = ownHouse.furniture.find(furniture => furniture.id === furnitureId);
      const self = network.members.find(member => member.identity.fingerprint === identity.public.fingerprint);
      if (!item || (self?.houseId && self.houseId !== identity.public.fingerprint)) throw new Error('Los archivos solo se abren desde tu propio espacio.');
      const file = await chooseLocalFile(); if (!file) return;
      data.projectLinks = { ...data.projectLinks, [furnitureId]: { name: file.name, kind: file.kind, ...(file.privatePath ? { privatePath: file.privatePath } : {}) } };
      if (file.kind === 'text') data.editor = file.content;
      else showLocalPreview(file);
      await persist(); notice = 'Archivo abierto localmente. El alias público del mueble no ha cambiado.'; update();
    }),
    saveEditor: text => run(async () => { if (new TextEncoder().encode(text).length > 1_048_576) throw new Error('El editor admite hasta 1 MiB.'); data.editor = text; await persist(); if (savingFailed) throw new Error('No se pudo guardar. Tus cambios siguen en el editor.'); notice = 'Snippet guardado solo en este equipo.'; update(); }),
    exportEditor: text => downloadLocal('studyvillage-snippet.txt', new Blob([text], { type: 'text/plain;charset=utf-8' })),
    exportBoard: canvas => { canvas.toBlob(blob => { if (blob) downloadLocal('studyvillage-pizarra.png', blob); else report(new Error('No se pudo exportar la pizarra.')); }, 'image/png'); },
    runDiagnostic: kind => diagnostic.run(kind),
    dismissNotice: () => { notice = null; update(); },
  };
  ui = createStudyUI(root, actions); subscribe(); actions.setCameraActivity('village');
  if (!loaded || wardrobeMigration) await persist();
  update();
  const dispose = () => {
    if (closed) return;
    closed = true; unsubscribe(); diagnostic.dispose(); client.dispose(); ui?.destroy();
    void writes.flush().finally(() => store.close());
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
