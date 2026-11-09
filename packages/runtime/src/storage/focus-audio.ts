import {z} from 'zod';
export const FOCUS_AUDIO_KEY='studyvillage-focus-audio-v1';
/** Ten seconds of mono 22.05 kHz PCM; independent of the source file format. */
export const focusAudioSchema=z.strictObject({id:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().min(1).max(120),data:z.string().max(600000).regex(/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/)});
export type FocusAudioAsset=z.infer<typeof focusAudioSchema>;
export async function verifyFocusAudio(raw:unknown):Promise<FocusAudioAsset>{
 const value=focusAudioSchema.parse(raw),bytes=Uint8Array.from(atob(value.data.split(',')[1]),c=>c.charCodeAt(0));
 const view=new DataView(bytes.buffer);if(bytes.length<46||bytes.length>441044||new TextDecoder().decode(bytes.slice(0,4))!=='RIFF'||new TextDecoder().decode(bytes.slice(8,16))!=='WAVEfmt '||view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint32(24,true)!==22050||view.getUint16(34,true)!==16||view.getUint32(40,true)!==bytes.length-44)throw Error('Archivo de sonido no válido.');
 const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(id!==value.id)throw Error('Archivo de sonido no válido.');return value;
}
export function loadFocusAudio():FocusAudioAsset|null{try{return focusAudioSchema.parse(JSON.parse(localStorage.getItem(FOCUS_AUDIO_KEY)||'null'));}catch{return null;}}
export async function saveFocusAudio(value:unknown){const asset=await verifyFocusAudio(value);localStorage.setItem(FOCUS_AUDIO_KEY,JSON.stringify(asset));return asset;}
