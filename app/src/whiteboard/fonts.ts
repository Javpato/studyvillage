import { excalifontFaces } from '../assets/fonts/excalifont/faces';
export const NOTE_FONTS = {
 sans:'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
 serif:'Georgia, serif',mono:'ui-monospace, monospace',excalifont:'Excalifont, cursive',
};
let ready:Promise<void>|null=null;
let generation=0;
export const boardFontGeneration=()=>generation;
/** Bundle every upstream subset for offline notes, including accented and non-Latin text. */
export function ensureExcalifont():Promise<void> {
 if(ready)return ready;
 if(typeof document==='undefined'||typeof FontFace==='undefined')return Promise.resolve();
 const faces=excalifontFaces.map(({url,unicodeRange})=>new FontFace('Excalifont',`url("${url}")`,{unicodeRange,weight:'400',style:'normal'}));
 ready=Promise.all(faces.map(face=>face.load())).then(loaded=>{for(const face of loaded)document.fonts.add(face);generation++;}).catch(error=>{ready=null;throw error;});
 return ready;
}
