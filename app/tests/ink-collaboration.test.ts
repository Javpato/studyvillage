import {describe,it,expect} from 'vitest';
import {eraseInk,viewToPage,selectedByLasso,moveInk} from '../../packages/documents/src/editing';
import {applyInkOperation,emptySharedInk,sharedPageToPrivate,type InkOperation,type SharedInkState} from '../../packages/documents/src/shared';
import {inkPackets,InkPackets} from '../../packages/documents/src/packets';
import {InkAuthority} from '../../packages/documents/src/authority';
import {newPage,type InkObject} from '../../packages/documents/src/model';
const point=(x:number,y=10)=>({x,y,pressure:.6,tiltX:10,tiltY:20,time:x+1});
const stroke=():InkObject=>({id:crypto.randomUUID(),tool:'pen',width:2,color:'#123456',points:[point(0),point(100)]});
const create=(ink:InkObject[]=[]):InkOperation=>({id:crypto.randomUUID(),kind:'page.create',page:{id:crypto.randomUUID(),title:'Selected page',background:'blank',ink,text:'Only this text'}});
describe('precise ink editing',()=>{
 it('splits a sparse segment at exact erase boundaries with interpolated metadata',()=>{
  const ink=stroke(),parts=eraseInk(ink,{x:50,y:10},9);expect(parts).toHaveLength(2);expect(parts[0].points.at(-1)!.x).toBeCloseTo(40);expect(parts[1].points[0].x).toBeCloseTo(60);expect(parts[0].points.at(-1)!.time).toBeCloseTo(41);expect(parts[0].points.at(-1)!.pressure).toBe(.6);expect(parts[0].id).not.toBe(ink.id);expect(ink.points).toHaveLength(2);
 });
 it('maps rotated and zoomed pointers back to the same document position',()=>{
  expect(viewToPage(30,50,384,512)).toEqual({x:60,y:100});expect(viewToPage(462,30,512,384,90)).toEqual({x:60,y:100});expect(viewToPage(354,462,384,512,180)).toEqual({x:60,y:100});expect(viewToPage(50,354,512,384,270)).toEqual({x:60,y:100});
 });
 it('selects geometry and moves it without rounding or changing its stable identity',()=>{
  const ink=stroke();expect(selectedByLasso(ink,[{x:-1,y:0},{x:101,y:0},{x:101,y:20},{x:-1,y:20}])).toBe(true);const moved=moveInk(ink,.125,.875);expect(moved.id).toBe(ink.id);expect(moved.points[0].x).toBe(.125);expect(ink.points[0].x).toBe(0);
 });
});
describe('shared ink authority',()=>{
 it('merges independent author layers, deduplicates retries, and rejects stale or unauthorized erasure',()=>{
  const a=stroke(),b=stroke(),start=create([a]);let state=applyInkOperation(emptySharedInk(),'alice',start);const pageId=state.pages[0].id;
  const add:InkOperation={id:crypto.randomUUID(),kind:'objects',pageId,changes:[{id:b.id,expected:0,ink:b}]};state=applyInkOperation(state,'bob',add);expect(applyInkOperation(state,'bob',add)).toBe(state);
  const erase:InkOperation={id:crypto.randomUUID(),kind:'objects',pageId,changes:[{id:a.id,expected:1,ink:null}]};expect(()=>applyInkOperation(state,'bob',erase)).toThrow('forbidden');state=applyInkOperation(state,'alice',erase);expect(sharedPageToPrivate(state.pages[0]).ink.map(i=>i.id)).toEqual([b.id]);
  expect(()=>applyInkOperation(state,'alice',{...erase,id:crypto.randomUUID(),changes:[{id:a.id,expected:1,ink:a}]})).toThrow('conflict');state=applyInkOperation(state,'alice',{...erase,id:crypto.randomUUID(),changes:[{id:a.id,expected:2,ink:a}]});expect(sharedPageToPrivate(state.pages[0]).ink).toHaveLength(2);
 });
 it('never shares private PDF references or hidden pages through the selected-copy schema',()=>{
  const page=newPage();(page as any).pdf={attachment:crypto.randomUUID(),page:1};const op=create();expect(()=>applyInkOperation(emptySharedInk(),'alice',{...op,page:{...page}} as InkOperation)).toThrow();
 });
 it('reassembles long unicode/ink payloads without truncating strokes',()=>{
  const ink=stroke();ink.points=Array.from({length:12000},(_,i)=>point(i%768+.125,i%1024));const value={t:'op',operation:create([ink]),label:'é'.repeat(5000)};const packets=inkPackets('village',value);expect(packets.length).toBeGreaterThan(20);expect(packets.every(p=>new TextEncoder().encode(p).length<56000)).toBe(true);const assembler=new InkPackets();let result:ReturnType<InkPackets['receive']>=null;for(const p of [...packets].reverse())result=assembler.receive('alice',p)||result;expect(result?.value).toEqual(value);
 });
 it('acknowledges only durable saves and applies permission revocation before the next payload',async()=>{
  let saved:SharedInkState|null=null,fail=false,allowed=true;const sent:string[]=[];const authority=new InkAuthority({load:()=>saved,save:(_key,state)=>{if(fail)throw Error('disk full');saved=state;},allowed:()=>allowed,moderator:()=>false,send:(_peer,data)=>{sent.push(data);return true;}});
  const send=async(value:unknown)=>{for(const p of inkPackets('village',value))await authority.receive('endpoint','alice','village-1',p);};
  fail=true;await send({t:'op',operation:create()});expect(saved).toBeNull();const reader=new InkPackets();expect(reader.receive('server',sent.at(-1)!)?.value).toMatchObject({t:'error',code:'storage'});
  fail=false;await send({t:'op',operation:create()});expect(saved).not.toBeNull();expect(reader.receive('server',sent.at(-1)!)?.value).toMatchObject({t:'ack'});const count=sent.length;allowed=false;await send({t:'hello'});expect(sent).toHaveLength(count);authority.dispose();
 });
});
