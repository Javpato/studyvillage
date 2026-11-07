import {layoutViewport} from './browser-viewport';
import { z } from 'zod';
export const HUD_IDS=['movement','interact','sprint','ptt','microphone','deafen','screen','camera','location','clock'] as const;
export type HudId=typeof HUD_IDS[number];
export const HUD_PROFILES=['phone-portrait','phone-landscape','tablet-portrait','tablet-landscape','desktop-landscape','desktop-portrait'] as const;
export type HudProfile=typeof HUD_PROFILES[number];
const widgetSchema=z.strictObject({x:z.number().min(0).max(100),y:z.number().min(0).max(100),scale:z.number().min(.5).max(1.75),color:z.string().regex(/^#[a-fA-F0-9]{6}$/).nullable(),visible:z.boolean()});
export type HudWidget=z.infer<typeof widgetSchema>;
export type HudLayout=Record<HudId,HudWidget>;
const storeSchema=z.partialRecord(z.enum(HUD_PROFILES),z.partialRecord(z.enum(HUD_IDS),widgetSchema));
const KEY='studyvillage-hud-layout-v1';
export function defaultHud(profile:HudProfile):HudLayout{
 let clock:HudWidget={x:80,y:16,scale:1,color:null,visible:false};try{const old=JSON.parse(localStorage.getItem('studyvillage-focus-clock-v1')||'null');if(old)clock={...clock,x:old.position.x*100,y:old.position.y*100,visible:old.hud??old.started};}catch{}
 const portrait=profile.endsWith('portrait');
 const phonePortrait=profile==='phone-portrait';
 const item=(x:number,y:number):HudWidget=>({x,y,scale:phonePortrait?.6:.75,color:null,visible:true});
 // Phone portrait: the screen fills the top two thirds, so the controls sit in a short deck below it.
 if(phonePortrait)return{clock,movement:item(20,86),interact:item(84,90),sprint:item(84,81),ptt:item(60,90),microphone:item(9,73),deafen:item(21,73),screen:item(33,73),camera:item(45,73),location:item(29,5)};
 return{clock,movement:item(portrait?19:12,portrait?82:75),interact:item(portrait?84:91,portrait?83:78),sprint:item(portrait?84:91,portrait?72:57),ptt:item(portrait?61:76,portrait?83:78),microphone:item(portrait?10:7,portrait?64:50),deafen:item(portrait?24:15,portrait?64:50),screen:item(portrait?38:23,portrait?64:50),camera:item(portrait?52:31,portrait?64:50),location:item(portrait?29:20,6)};
}
export function loadHud(profile:HudProfile):HudLayout{
 try{const value=storeSchema.parse(JSON.parse(localStorage.getItem(KEY)||'{}'));return {...defaultHud(profile),...value[profile]};}catch{return defaultHud(profile);}
}
export function saveHud(profile:HudProfile,layout:HudLayout):void{saveHudLayouts({[profile]:layout});}
export function saveHudLayouts(layouts:Partial<Record<HudProfile,HudLayout>>):void{
 let previous:z.infer<typeof storeSchema>={};try{previous=storeSchema.parse(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{/* Preserve valid layout changes even if an older preference was unreadable. */}
 localStorage.setItem(KEY,JSON.stringify(storeSchema.parse({...previous,...layouts})));
}
export function mobileKind(): 'phone'|'tablet'|null {
 const touch=navigator.maxTouchPoints>0||matchMedia('(pointer: coarse)').matches;
 if(!touch)return null;
 const viewport=layoutViewport(),short=Math.min(viewport.width,viewport.height);
 if(!/Android|iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent)&&short>1024)return null;
 return short>=600?'tablet':'phone';
}
export function currentHudProfile():HudProfile{const {width,height}=layoutViewport();return `${mobileKind()??'desktop'}-${width>height?'landscape':'portrait'}`;}
