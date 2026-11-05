import { z } from 'zod';
import { inkSchema,pageSchema,newPage,type InkObject,type InkPage } from './model';
export const inkScopeSchema=z.string().regex(/^(village|room:[a-f0-9]{64}:[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{1,32})$/);
const objectSchema=z.object({id:z.string().uuid(),author:z.string().min(1).max(128),revision:z.number().int().positive(),ink:inkSchema.nullable()});
const textSchema=z.object({author:z.string().min(1).max(128),revision:z.number().int().positive(),text:z.string().max(100000)});
const sharedPageSchema=z.object({id:z.string().uuid(),title:z.string().max(100),background:pageSchema.shape.background,image:z.string().startsWith('data:image/png;base64,').max(1500000).optional(),objects:z.array(objectSchema).max(20000),texts:z.array(textSchema).max(24)});
export const sharedStateSchema=z.object({schema:z.literal(1),revision:z.number().int().nonnegative(),pages:z.array(sharedPageSchema).max(64),seen:z.array(z.string().uuid()).max(5000)});
export type SharedInkState=z.infer<typeof sharedStateSchema>;
export type SharedInkPage=z.infer<typeof sharedPageSchema>;
const metadata={id:z.string().uuid(),title:z.string().max(100),background:pageSchema.shape.background,image:sharedPageSchema.shape.image};
export const inkOperationSchema=z.discriminatedUnion('kind',[
 z.strictObject({id:z.string().uuid(),kind:z.literal('page.create'),page:z.strictObject({...metadata,ink:z.array(inkSchema).max(20000),text:z.string().max(100000)})}),
 z.strictObject({id:z.string().uuid(),kind:z.literal('objects'),pageId:z.string().uuid(),changes:z.array(z.strictObject({id:z.string().uuid(),expected:z.number().int().nonnegative(),ink:inkSchema.nullable()})).min(1).max(20000)}),
 z.strictObject({id:z.string().uuid(),kind:z.literal('text'),pageId:z.string().uuid(),expected:z.number().int().nonnegative(),text:z.string().max(100000)}),
]);
export type InkOperation=z.infer<typeof inkOperationSchema>;
export class InkConflict extends Error {constructor(readonly code:'forbidden'|'conflict'|'limit'|'invalid'){super(code);}}
export function emptySharedInk():SharedInkState{return {schema:1,revision:0,pages:[],seen:[]};}
/** Atomic, idempotent compare-and-set. Authors retain their layers; only explicit owner moderation edits another layer. */
export function applyInkOperation(state:SharedInkState,actor:string,raw:InkOperation,moderator=false):SharedInkState {
 const op=inkOperationSchema.parse(raw);if(state.seen.includes(op.id))return state;
 const next={...state,pages:state.pages.slice(),revision:state.revision+1,seen:[...state.seen.slice(-4999),op.id]};
 if(op.kind==='page.create'){
  if(state.pages.some(p=>p.id===op.page.id))throw new InkConflict('conflict');if(state.pages.length>=64)throw new InkConflict('limit');
  if(new Set(op.page.ink.map(i=>i.id)).size!==op.page.ink.length)throw new InkConflict('invalid');
  next.pages.push({id:op.page.id,title:op.page.title,background:op.page.background,...(op.page.image?{image:op.page.image}:{}),objects:op.page.ink.map(ink=>({id:ink.id,author:actor,revision:1,ink})),texts:op.page.text?[{author:actor,revision:1,text:op.page.text}]:[]});
 }else{
  const index=state.pages.findIndex(p=>p.id===op.pageId);if(index<0)throw new InkConflict('conflict');const page=state.pages[index];
  if(op.kind==='text'){
   const old=page.texts.find(t=>t.author===actor);if((old?.revision??0)!==op.expected)throw new InkConflict('conflict');
   next.pages[index]={...page,texts:[...page.texts.filter(t=>t.author!==actor),{author:actor,revision:(old?.revision??0)+1,text:op.text}]};
  }else{
   if(new Set(op.changes.map(c=>c.id)).size!==op.changes.length)throw new InkConflict('invalid');
   const objects=new Map(page.objects.map(o=>[o.id,o]));
   for(const change of op.changes){const old=objects.get(change.id);if(old&&old.author!==actor&&!moderator)throw new InkConflict('forbidden');if((old?.revision??0)!==change.expected)throw new InkConflict('conflict');if(change.ink&&change.ink.id!==change.id)throw new InkConflict('invalid');if(!old&&!change.ink)throw new InkConflict('conflict');}
   for(const change of op.changes){const old=objects.get(change.id);objects.set(change.id,{id:change.id,author:old?.author??actor,revision:(old?.revision??0)+1,ink:change.ink});}
   if(objects.size>20000)throw new InkConflict('limit');next.pages[index]={...page,objects:[...objects.values()]};
  }
 }
 if(JSON.stringify(next).length>25*1024*1024)throw new InkConflict('limit');return next;
}
export function sharedPageToPrivate(page:SharedInkPage):InkPage {
 return {...newPage(page.title),id:page.id,background:page.background,...(page.image?{image:page.image}:{}),ink:page.objects.flatMap(o=>o.ink?[structuredClone(o.ink)]:[]),text:page.texts.map(t=>t.text).join('\n')};
}
export function changesForPage(before:InkPage,after:InkPage,state:SharedInkPage):InkOperation|null {
 const previous=new Map(before.ink.map(i=>[i.id,i])),current=new Map(after.ink.map(i=>[i.id,i]));const changes=[];
 for(const id of new Set([...previous.keys(),...current.keys()]))if(JSON.stringify(previous.get(id))!==JSON.stringify(current.get(id)))changes.push({id,expected:state.objects.find(o=>o.id===id)?.revision??0,ink:current.get(id)??null});
 return changes.length?{id:crypto.randomUUID(),kind:'objects',pageId:state.id,changes}:null;
}
