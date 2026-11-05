import {afterEach,describe,expect,it,vi} from 'vitest';
import {PenInput,PencilTouchGuard,pointerSamples} from '../../packages/documents/src/pen';
import {detectPencil,getPencilMode,setPencilMode,subscribePencilMode,PENCIL_MODE_KEY} from '../src/input/pencil-mode';
import {parseBackup} from '../../packages/runtime/src/storage/backup';
import {newLocalData} from '../../packages/runtime/src/storage/local-store';
const pen={pointerId:1,pointerType:'pen',clientX:10.125,clientY:20.875,pressure:.001,timeStamp:10,buttons:0};
afterEach(()=>vi.unstubAllGlobals());
describe('light Pencil input and complete samples',()=>{
 it('starts without requiring force or a pressed-button bit and retains very light/subpixel contact',()=>{const input=new PenInput();expect(input.begin(pen)).toBe(true);expect(input.point(pen,{left:0,top:0,width:768,height:1024})).toMatchObject({x:10.125,y:20.875,pressure:.001});input.finish(1);expect(input.begin({...pen,pressure:0})).toBe(true);});
 it('keeps every coalesced sample and the final dispatched position without adding it twice',()=>{const early={...pen,clientX:8,timeStamp:8};expect(pointerSamples({...pen,getCoalescedEvents:()=>[early,pen]})).toEqual([early,pen]);const event={...pen,clientX:12,getCoalescedEvents:()=>[early,pen]};expect(pointerSamples(event)).toEqual([early,pen,event]);});
 it('falls back when older Safari lacks/rejects coalesced events and excludes unrelated pointers',()=>{expect(pointerSamples(pen)).toEqual([pen]);const unsupported={...pen,getCoalescedEvents:()=>{throw Error('unsupported');}};expect(pointerSamples(unsupported)).toEqual([unsupported]);const other={...pen,getCoalescedEvents:()=>[{...pen,pointerId:7}]};expect(pointerSamples(other)).toEqual([other]);});
});
describe('palm quarantine',()=>{
 it('Hand bypasses only the post-pen delay, preserving active-pen and broad-palm rejection',()=>{
  const guard=new PencilTouchGuard();guard.penDown();expect(guard.touchDown({pointerId:1,timeStamp:10,width:8},true,true)).toBe(false);
  guard.touchEnd(1);guard.penUp(100);expect(guard.touchDown({pointerId:2,timeStamp:110,width:8},true,true)).toBe(true);guard.touchEnd(2);
  expect(guard.touchDown({pointerId:3,timeStamp:110,width:8},true)).toBe(false);guard.touchEnd(3);
  expect(guard.touchDown({pointerId:4,timeStamp:110,width:60},true,true)).toBe(false);
 });
 it('quarantines existing contacts on tool change and the entire Hand gesture on a third contact',()=>{
  const guard=new PencilTouchGuard();guard.touchDown({pointerId:1,timeStamp:0},true,true);guard.quarantineTouches();expect(guard.touchMove({pointerId:1,width:8},true)).toBe(false);guard.touchEnd(1);
  for(const pointerId of [1,2])expect(guard.touchDown({pointerId,timeStamp:100},true,true)).toBe(true);
  expect(guard.touchDown({pointerId:3,timeStamp:110},true,true)).toBe(false);expect(guard.ignores(1)).toBe(true);expect(guard.ignores(2)).toBe(true);
  guard.touchEnd(3);expect(guard.touchDown({pointerId:4,timeStamp:120},true,true)).toBe(false);
  for(const id of [1,2,4])guard.touchEnd(id);expect(guard.touchDown({pointerId:1,timeStamp:130},true,true)).toBe(true);
 });
 it('rejects a contact that grows into a palm and recovers recycled ids after a missing end',()=>{const guard=new PencilTouchGuard();expect(guard.touchDown({pointerId:2,timeStamp:0,width:8},true)).toBe(true);expect(guard.touchMove({pointerId:2,width:50},true)).toBe(false);expect(guard.touchMove({pointerId:2,width:8},true)).toBe(false);expect(guard.touchDown({pointerId:2,timeStamp:500,width:8},true)).toBe(true);});
 it('lets a pen take priority over a previously resting contact until that contact lifts',()=>{const guard=new PencilTouchGuard();expect(guard.touchDown({pointerId:2,timeStamp:0},true)).toBe(true);guard.penDown();expect(guard.ignores(2)).toBe(true);guard.penUp(100);expect(guard.ignores(2)).toBe(true);guard.touchEnd(2);expect(guard.touchDown({pointerId:2,timeStamp:500},true)).toBe(true);});
 it('blocks new palms during and immediately after pen-up; deliberate later fingers work',()=>{const guard=new PencilTouchGuard();guard.penDown();expect(guard.touchDown({pointerId:2,timeStamp:50},true)).toBe(false);guard.penUp(100);expect(guard.touchDown({pointerId:3,timeStamp:349},true)).toBe(false);expect(guard.touchDown({pointerId:4,timeStamp:350},true)).toBe(true);expect(guard.ignores(2)).toBe(true);expect(guard.ignores(3)).toBe(true);});
 it('uses broad contact rejection in explicit Pencil mode and clears lost contacts on reset',()=>{const guard=new PencilTouchGuard();expect(guard.touchDown({pointerId:2,timeStamp:0,width:40,height:10},true)).toBe(false);expect(guard.touchDown({pointerId:3,timeStamp:0,width:40,height:10},false)).toBe(true);guard.penDown();guard.reset();expect(guard.ignores(2)).toBe(false);expect(guard.touchDown({pointerId:2,timeStamp:1},true)).toBe(true);});
});
describe('shared persisted Pencil preference',()=>{
 function storage(){const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});vi.stubGlobal('document',{documentElement:{dataset:{}}});vi.stubGlobal('window',new EventTarget());return values;}
 it('preserves the previous mode by default and synchronizes subscribers plus cross-tab changes',()=>{const values=storage(),one=vi.fn(),two=vi.fn();expect(getPencilMode()).toBe(false);const off1=subscribePencilMode(one),off2=subscribePencilMode(two);try{setPencilMode(true);expect(values.get(PENCIL_MODE_KEY)).toBe('true');expect(one).toHaveBeenLastCalledWith(true);expect(two).toHaveBeenLastCalledWith(true);expect(document.documentElement.dataset.pencilMode).toBe('true');values.set(PENCIL_MODE_KEY,'false');window.dispatchEvent(Object.assign(new Event('storage'),{key:PENCIL_MODE_KEY}));expect(one).toHaveBeenLastCalledWith(false);off1();setPencilMode(true);expect(one).toHaveBeenLastCalledWith(false);}finally{off1();off2();}});
 it('keeps the requested session mode when persistence is unavailable',()=>{storage();vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw Error('quota');});setPencilMode(true);expect(getPencilMode()).toBe(true);vi.restoreAllMocks();setPencilMode(false);});
 it('includes a strictly boolean preference in portable backups',async()=>{const raw={format:'studyvillage-backup',version:1,createdAt:1,local:newLocalData(),values:{[PENCIL_MODE_KEY]:'true'},notebooks:{notebooks:[],attachments:[]}};expect((await parseBackup(JSON.stringify(raw))).values[PENCIL_MODE_KEY]).toBe('true');await expect(parseBackup(JSON.stringify({...raw,values:{[PENCIL_MODE_KEY]:'"enabled"'}}))).rejects.toThrow();});
 it('automatically enables on the first pen, then respects a manual opt-out',()=>{storage();setPencilMode(false);detectPencil('touch');expect(getPencilMode()).toBe(false);detectPencil('pen');expect(getPencilMode()).toBe(true);setPencilMode(false);detectPencil('pen');expect(getPencilMode()).toBe(false);});
});
