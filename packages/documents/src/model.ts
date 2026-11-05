import { z } from 'zod';
import { inkPath } from './editing';
const finite = z.number().finite();
export const sampleSchema = z.object({ x: finite.min(-10000).max(10000), y: finite.min(-10000).max(10000), pressure: finite.min(0).max(1), tiltX: finite.min(-90).max(90), tiltY: finite.min(-90).max(90), time: finite.nonnegative() });
export const inkSchema = z.object({ id: z.string().uuid(), tool: z.enum(['pen','highlight','line','rectangle']), color: z.string().regex(/^#[0-9a-f]{6}$/i), width: finite.min(.25).max(40), points: z.array(sampleSchema).min(1).max(200000) });
export const pageSchema = z.object({ id:z.string().uuid(), title:z.string().max(100), image:z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/).max(1500000).optional(), pdf:z.object({attachment:z.string().uuid(),page:z.number().int().min(1).max(500)}).optional(), background:z.enum(['blank','lined','grid']), ink:z.array(inkSchema).max(20000), text:z.string().max(100000), deleted:z.boolean().default(false) });
export const notebookSchema = z.object({ schema:z.literal(1), id:z.string().uuid(), revision:z.number().int().nonnegative(), title:z.string().min(1).max(100), pages:z.array(pageSchema).min(1).max(500), updatedAt:finite });
export type InkSample = z.infer<typeof sampleSchema>;
export type InkObject = z.infer<typeof inkSchema>;
export type InkPage = z.infer<typeof pageSchema>;
export type Notebook = z.infer<typeof notebookSchema>;
export function newPage(title=''):InkPage {return {id:crypto.randomUUID(),title,background:'lined',ink:[],text:'',deleted:false};}
export function newNotebook(title:string):Notebook {return {schema:1,id:crypto.randomUUID(),revision:0,title,pages:[newPage()],updatedAt:Date.now()};}
export function parseBackup(text:string):Notebook {
 if(new TextEncoder().encode(text).length>25*1024*1024)throw new Error('La copia supera 25 MiB.');
 const result=notebookSchema.parse(JSON.parse(text));
 if(new Set(result.pages.map(p=>p.id)).size!==result.pages.length || !result.pages.some(p=>!p.deleted))throw new Error('Copia no válida.');
 const ids=result.pages.flatMap(p=>p.ink.map(i=>i.id));if(new Set(ids).size!==ids.length)throw new Error('Copia no válida.');
 return result;
}
/** A copy contains only this page; no other private pages or live link. */
export function copyPage(page:InkPage):InkPage {return {...structuredClone(page),id:crypto.randomUUID(),ink:page.ink.map(i=>({...structuredClone(i),id:crypto.randomUUID()}))};}
export function hitsInk(ink:InkObject,x:number,y:number,radius:number):boolean {
 const points=inkPath(ink);if(points.length===1)return Math.hypot(points[0].x-x,points[0].y-y)<=radius+ink.width/2;
 return points.some((b,i)=>{if(!i)return false;const a=points[i-1];const dx=b.x-a.x,dy=b.y-a.y;const length=dx*dx+dy*dy;const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)):0;return Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=radius+ink.width/2;});
}
