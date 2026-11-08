import {describe,it,expect} from 'vitest';
import {PetController,petConfigSchema,type PetHome,type PetNavigation} from '../../packages/core/src/pets/model';
import {petSnapshotSchema} from '../../packages/core/src/pets/protocol';
const home=(species:PetHome['species']):PetHome=>({id:species,owner:'a'.repeat(64),furnitureId:species,species,scene:'room',x:60,y:60,config:{id:species,mode:'roam'}});
const nav:PetNavigation={path:(_s,_a,b)=>[b],safe:(_s,p)=>p,wander:()=>null,bowls:()=>[]};
const owner={scene:'room',position:{x:300,y:60}};
describe('pet expressions and saved abilities',()=>{
 it('lands a commanded rabbit jump on a multi-segment route in 750 ms, then resumes its saved mode',()=>{
  const h=home('rabbit');h.config.mode='follow';const c=new PetController({...nav,path:()=>[{x:61,y:60},{x:62,y:60},{x:84,y:60},{x:100,y:60}]});c.reconcile([h]);c.tick(.01,0,owner);expect(c.entities()[0].jumpProgress).toBeUndefined();
  expect(c.ability(h.id,0,{x:100,y:60})).toBe(true);expect(c.ability(h.id,1)).toBe(false);
  for(let i=1;i<=5;i++)c.tick(.075,i*75,owner);expect(c.entities()[0].jumpProgress).toBeCloseTo(.5);expect(c.entities()[0].x).toBeGreaterThan(62);expect(c.entities()[0].x).toBeLessThan(100);
  for(let i=6;i<=10;i++)c.tick(.075,i*75,owner);expect(c.entities()[0].x).toBeCloseTo(100);expect(c.entities()[0].jumpProgress).toBeUndefined();c.tick(.01,760,owner);expect(c.entities()[0].state).toBe('following');
 });
 it('jumps in place when the route is unreachable and cancels safely on room transfer',()=>{
  const h=home('rabbit'),c=new PetController({...nav,path:()=>null});c.reconcile([h]);expect(c.ability(h.id,0,{x:90,y:60})).toBe(true);c.tick(.1,100,owner);expect(c.entities()[0]).toMatchObject({x:60,y:60});expect(c.entities()[0].jumpProgress).toBeGreaterThan(0);
  c.reconcile([{...h,scene:'next'}]);expect(c.entities()[0]).toMatchObject({scene:'next',state:'idle'});expect(c.entities()[0].jumpProgress).toBeUndefined();
 });
 it('keeps the hamster ball through reload, mode changes, petting, rooms and games until explicitly removed',()=>{
  let h=home('hamster');h.config=petConfigSchema.parse(JSON.parse(JSON.stringify({...h.config,ball:true})));const c=new PetController(nav);c.reconcile([h]);expect(c.ability(h.id,0)).toBe(false);expect(c.entities()[0].ball).toBe(true);
  c.pet(h.id,0);for(let i=0;i<80;i++)c.tick(.1,i*100,owner);expect(c.entities()[0].ball).toBe(true);
  h={...h,config:{...h.config,mode:'follow'}};c.reconcile([h]);c.tick(.1,9000,{...owner,scene:'next'});expect(c.entities()[0]).toMatchObject({scene:'next',ball:true});c.reserve(h.id,true);c.reserve(h.id,false);expect(c.entities()[0].ball).toBe(true);
  const reload=new PetController(nav);reload.reconcile([structuredClone(h)]);expect(reload.entities()[0].ball).toBe(true);reload.reconcile([{...h,config:{...h.config,ball:false}}]);expect(reload.entities()[0].ball).toBe(false);
  expect(petConfigSchema.parse({id:'old',mode:'roam'}).ball).toBeUndefined();
 });
 it('speaks on a visitor entering the same area, with hysteresis, cooldown and an expiring literal phrase',()=>{
  const h=home('parrot');h.config.phrase='<b>Bonjour</b>';const c=new PetController(nav,()=>.5);c.reconcile([h]);const visitor=(x:number,scene='room')=>[{id:'guest',scene,position:{x,y:60}}];
  c.tick(.1,1000,owner,visitor(60,'other'));expect(c.entities()[0].phrase).toBeUndefined();c.tick(.1,1100,owner,visitor(60));expect(c.entities()[0]).toMatchObject({phrase:'<b>Bonjour</b>',speechId:1100,automaticSpeech:true,speechUntil:9100});
  c.tick(.1,22000,owner,visitor(130));c.tick(.1,22100,owner,visitor(60));expect(c.entities()[0].speechId).toBe(1100);expect(c.entities()[0].phrase).toBeUndefined(); // 70px is still within the exit boundary.
  c.tick(.1,22200,owner,visitor(200));c.tick(.1,22300,owner,visitor(60));expect(c.entities()[0].speechId).toBe(22300);
  c.tick(.1,22400,owner,visitor(200));c.tick(.1,22500,owner,visitor(60));expect(c.entities()[0].speechId).toBe(22300);
  c.reserve(h.id,true);c.tick(.1,50000,owner,visitor(60));expect(c.entities()[0].phrase).toBeUndefined();c.reserve(h.id,false);
 });
 it('keeps empty parrots silent and manual repeat available',()=>{
  const h=home('parrot'),c=new PetController(nav);c.reconcile([h]);c.tick(.1,0,{...owner,position:{x:60,y:60}});expect(c.entities()[0].phrase).toBeUndefined();h.config.phrase='Bonjour';c.reconcile([h]);expect(c.ability(h.id,100)).toBe(true);expect(c.entities()[0]).toMatchObject({phrase:'Bonjour',automaticSpeech:false});
 });
 it('validates optional presentation state without breaking older snapshots',()=>{
  const c=new PetController(nav);c.reconcile([home('rabbit')]);const p=c.entities()[0],packet=(pet:unknown)=>({version:1,seq:1,pets:[pet]});expect(petSnapshotSchema.safeParse(packet(p)).success).toBe(true);
  expect(petSnapshotSchema.safeParse(packet({...p,jumpProgress:.5,ball:true,speechId:1,speechUntil:8000,automaticSpeech:true})).success).toBe(true);
  for(const jumpProgress of [-1,1.1,NaN,Infinity])expect(petSnapshotSchema.safeParse(packet({...p,jumpProgress})).success).toBe(false);
 });
});
