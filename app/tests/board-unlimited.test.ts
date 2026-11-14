import {describe,it,expect} from 'vitest';
import {WhiteboardRegistry} from '../../packages/core/src/whiteboard/boards-registry';
import {BoardStore} from '../../packages/runtime/src/session/board';
import {boardBatches} from '../../packages/core/src/whiteboard/batches';
import {validateClipboard} from '../../packages/core/src/whiteboard/selection';
import {enclosedRegion} from '../src/whiteboard/fill-region';
import {floodPixels} from '../src/ui/sprite-tools';
import type {BoardStroke} from '../../packages/core/src/protocol/types';
const stroke=(n:number):BoardStroke=>({id:'s'+n,author:'a'.repeat(64),boardId:'b'.repeat(64),seq:1,tool:'pen',color:'#112233',width:2,points:[{x:n%500,y:1},{x:n%500,y:2}],deleted:false});
describe('large boards',()=>{
 it('keeps 5000 objects across reload, clear, and later drawing',()=>{let raw:string|null=null;const storage={getItem:()=>raw,setItem:(_:string,v:string)=>{raw=v;}};const r=new WhiteboardRegistry(storage),list=Array.from({length:5000},(_,i)=>stroke(i)),id=list[0].boardId;r.commitStrokes(id,list);expect(new WhiteboardRegistry(storage).getStrokes(id)).toHaveLength(5000);r.commitStrokes(id,list.map(s=>({...s,seq:2,deleted:true})));r.commitStrokes(id,[stroke(6000)]);expect(r.getStrokes(id).filter(s=>!s.deleted)).toHaveLength(1);});
 it('does not cap edits and does not resurrect deleted objects',()=>{const store=new BoardStore();for(let i=0;i<3000;i++)expect(store.apply({stroke:{...stroke(0),seq:i+1},signature:''})).toBe('applied');expect(store.apply({stroke:{...stroke(0),seq:3001,deleted:true},signature:''})).toBe('applied');expect(store.apply({stroke:{...stroke(0),seq:3002},signature:''})).toBe('duplicate');});
 it('copies thousands of objects and bounds signed network envelopes',()=>{const list=Array.from({length:3000},(_,i)=>({...stroke(i),points:Array.from({length:512},(_,j)=>({x:j+.123,y:i+.456}))}));expect(validateClipboard({kind:'studyvillage-selection',version:1,objects:list})).toHaveLength(3000);const batches=[...boardBatches(list)];expect(batches.flat()).toHaveLength(3000);for(const batch of batches){expect(batch.length).toBeLessThanOrEqual(128);expect(new TextEncoder().encode(JSON.stringify({type:'board.commit',document:{id:'x'.repeat(80),boardId:'b'.repeat(64),signature:'s'.repeat(86),documents:batch.map(stroke=>({stroke,signature:'s'.repeat(86)}))}})).length).toBeLessThan(64512);}});
});
describe('buckets',()=>{
 it('fills only connected pixels and treats transparent RGB as transparent',()=>{const p=new Uint8ClampedArray(4*4*4);for(let y=0;y<4;y++)p.set([0,0,0,255],(y*4+2)*4);p[0]=150;expect(floodPixels(p,4,4,0,0,[255,0,0,255])).toBe(true);expect(p[3]).toBe(255);expect(p[(3*4+3)*4+3]).toBe(0);});
 it('rejects open regions and retains enclosed holes',()=>{const p=new Uint8ClampedArray(10*10*4);for(let y=1;y<9;y++)for(let x=1;x<9;x++)if(x===1||x===8||y===1||y===8||x===4&&y===4)p[(y*10+x)*4+3]=255;const runs=enclosedRegion(p,10,10,2,2)!;expect(runs.reduce((n,r)=>n+r[2]*r[3],0)).toBe(35);p[(1*10+2)*4+3]=0;expect(enclosedRegion(p,10,10,2,2)).toBeNull();});
});
