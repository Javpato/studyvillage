import type {FocusSound} from './focus-clock-model';
import {verifyFocusAudio,type FocusAudioAsset} from '../../../packages/runtime/src/storage/focus-audio';
/** Central semantic sound definitions: change these notes without changing timer logic. */
export const FOCUS_SOUNDS={bell:{label:'Campana suave',notes:[523.25,783.99],spacing:.14,decay:1.3},chime:{label:'Carillón',notes:[523.25,659.25,783.99],spacing:.18,decay:.9},drop:{label:'Gota',notes:[880,659.25],spacing:.1,decay:.45}} as const;
export class FocusAudio {
 private context:AudioContext|null=null;private sources=new Set<AudioScheduledSourceNode>();private buffers=new Map<string,AudioBuffer>();private generation=0;private lastAlert=0;
 constructor(private error:(key:string)=>void){}
 async enable(){try{this.context??=new AudioContext();await this.context.resume();if(this.context.state!=='running')throw Error();return true;}catch{this.error('Toca Activar sonido en este dispositivo para escuchar las alertas.');return false;}}
 private stop(){this.generation++;for(const source of this.sources){try{source.stop();}catch{}}this.sources.clear();}
 get enabled(){return this.context?.state==='running';}
 async import(file:File):Promise<FocusAudioAsset>{
  if(!file.size||file.size>5*1024*1024)throw Error('Elige un archivo de audio de hasta 5 MB.');
  const decoder=new AudioContext();try{
   let input:AudioBuffer;try{input=await decoder.decodeAudioData(await file.arrayBuffer());}catch{throw Error('No se pudo reproducir el archivo. Prueba otro formato.');}
   if(!Number.isFinite(input.duration)||input.duration<=0)throw Error('Archivo de sonido no válido.');
   const render=new OfflineAudioContext(1,Math.max(1,Math.floor(Math.min(10,input.duration)*22050)),22050),source=render.createBufferSource();source.buffer=input;source.connect(render.destination);source.start();const clip=await render.startRendering(),samples=clip.getChannelData(0),bytes=new Uint8Array(44+samples.length*2),view=new DataView(bytes.buffer);
   const text=(offset:number,value:string)=>Array.from(value).forEach((c,i)=>bytes[offset+i]=c.charCodeAt(0));text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,22050,true);view.setUint32(28,44100,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);samples.forEach((v,i)=>view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,v))*(v<0?32768:32767)),true));
   let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');return {id,name:file.name.slice(0,120)||'Audio',data:'data:audio/wav;base64,'+btoa(binary)};
  }finally{await decoder.close();}
 }
 baseline(id:number){this.lastAlert=id;}
 silence(){this.stop();}
 async alert(event:{id:number;at:number},sound:FocusSound,asset:FocusAudioAsset|null){if(event.id<=this.lastAlert)return;this.lastAlert=event.id;if(Date.now()-event.at>10000)return;await this.play(sound,asset);}
 async play(sound:FocusSound,asset:FocusAudioAsset|null){
  this.stop();if(sound.kind==='silent'||sound.volume===0)return;if(!this.enabled){this.error('Toca Activar sonido en este dispositivo para escuchar las alertas.');return;}
  const context=this.context!,generation=this.generation;
  try{
   if(sound.kind==='custom'){
    if(!asset||asset.id!==sound.customId)throw Error('El sonido personalizado no está disponible. Elige otro sonido.');
    let buffer=this.buffers.get(asset.id);if(!buffer){await verifyFocusAudio(asset);buffer=await context.decodeAudioData(Uint8Array.from(atob(asset.data.split(',')[1]),c=>c.charCodeAt(0)).buffer);this.buffers.clear();this.buffers.set(asset.id,buffer);}if(generation!==this.generation)return;
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=sound.volume;source.connect(gain).connect(context.destination);this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();};source.start(0,0,Math.min(10,buffer.duration));
   }else{const def=FOCUS_SOUNDS[sound.kind];def.notes.forEach((frequency,i)=>{const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime+i*def.spacing;oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(sound.volume*.18,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+def.decay);oscillator.connect(gain).connect(context.destination);this.sources.add(oscillator);oscillator.onended=()=>{this.sources.delete(oscillator);oscillator.disconnect();gain.disconnect();};oscillator.start(at);oscillator.stop(at+def.decay+.02);});}
  }catch(e){this.error(e instanceof Error?e.message:'No se pudo reproducir el archivo. Prueba otro formato.');}
 }
 dispose(){this.stop();void this.context?.close();this.context=null;this.buffers.clear();}
}
