/** Local PNG sheet: three animation columns, rows down/left/right/up. */
const KEY = 'studyvillage-avatar-sheet-v1';
let sheet: HTMLImageElement | null = null;
const remote=new Map<string,HTMLImageElement>();
export function getRemoteAvatarSheet(person:string):HTMLImageElement|null{return remote.get(person)??null;}
export function storeRemoteAvatarSheet(person:string,image:HTMLImageElement):void{if(remote.size>=24&&!remote.has(person))remote.delete(remote.keys().next().value!);remote.set(person,image);}
export function clearRemoteAvatarSheets():void{remote.clear();}
export function avatarSheetData():string|null{return sheet?.src??null;}
export function getAvatarSheet(): HTMLImageElement | null {
  return sheet?.complete && sheet.naturalWidth > 0 ? sheet : null;
}
export async function setAvatarSheet(data: string | null): Promise<void> {
  if (data === null) { localStorage.removeItem(KEY); sheet = null; return; }
  const img=await decodeAvatarSheet(data);
  localStorage.setItem(KEY, data);
  sheet = img;
}
export async function decodeAvatarSheet(data:string):Promise<HTMLImageElement> {
  if (data.length > 700_000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Elige un PNG de hasta 512 KB.');
  const img = new Image();
  img.src = data;
  await img.decode();
  if (img.naturalWidth !== 192 || img.naturalHeight !== 256) {
    throw new Error('El sprite debe medir 192 × 256: 3 columnas y 4 filas de 64 × 64.');
  }
  return img;
}
export function loadAvatarSheet(): void {
  try { const data = localStorage.getItem(KEY); if (data) void setAvatarSheet(data).catch(() => {}); } catch { /* Keep the default avatar. */ }
}
