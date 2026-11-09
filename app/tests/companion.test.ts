import {describe,it,expect,vi} from 'vitest';
import {CompanionSession,type PairCallbacks} from '../../packages/runtime/src/companion/session';
import type {DataChannel,TransportEndpoint} from '../../packages/runtime/src/transport/types';
import {newNotebook,newPage,type Notebook} from '../../packages/documents/src/model';
import {notebookEdit,applyNotebookEdit} from '../../packages/documents/src/notebook-edits';
import {InkPackets} from '../../packages/documents/src/packets';
class Channel implements DataChannel {
 open=true;bufferedAmount=0;other!:Channel;listeners=new Set<(v:unknown)=>void>();closes=new Set<()=>void>();sent:string[]=[];
 constructor(readonly endpoint:string){}
 send(data:string){this.sent.push(data);queueMicrotask(()=>{if(this.other.open)for(const fn of this.other.listeners)fn(data);});}
 close(){if(!this.open)return;this.open=false;for(const fn of this.closes)fn();if(this.other.open)this.other.close();}
 onOpen(_f:()=>void){return()=>{};}onData(f:(v:unknown)=>void){this.listeners.add(f);return()=>this.listeners.delete(f);}onClose(f:()=>void){this.closes.add(f);return()=>this.closes.delete(f);}
}
function network(){const endpoints=new Map<string,{listeners:Set<(c:DataChannel)=>void>;channels:Channel[]}>();let serial=0;return async(id='peer-'+(++serial)):Promise<TransportEndpoint>=>{const local={listeners:new Set<(c:DataChannel)=>void>(),channels:[] as Channel[]};endpoints.set(id,local);return {id,connect:to=>{const remote=endpoints.get(to)!;const a=new Channel(to),b=new Channel(id);a.other=b;b.other=a;local.channels.push(a);remote.channels.push(b);queueMicrotask(()=>{for(const fn of remote.listeners)fn(b);});return a;},call:()=>{throw Error('Fake media not implemented');},onConnection:fn=>{local.listeners.add(fn);return()=>local.listeners.delete(fn);},onCall:()=>()=>{},onSignalingChange:()=>()=>{},destroy:()=>{local.channels.forEach(c=>c.close());endpoints.delete(id);}};};}
const callbacks=(request:PairCallbacks['request']=vi.fn(async()=>null)):PairCallbacks=>({changed:()=>{},prepare:async()=>{},request,disconnected:()=>{},media:call=>call.close()});
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
describe('private companion pairing using explicitly simulated channels',()=>{
 it.each(['creator','joiner'] as const)('creator assigns %s as main without exchanging an identity',async primary=>{const factory=network(),request=vi.fn(async()=>({remaining:30})),a=new CompanionSession(callbacks(request),factory),b=new CompanionSession(callbacks(request),factory);await a.invite('Computer');await b.join(a.state.code,'Tablet');await flush();expect(a.state.phase).toBe('approval');expect(b.state.phase).toBe('waiting');await a.approve(primary,['focus']);await flush();expect(a.state.phase).toBe('linked');expect(b.state.phase).toBe('linked');const remote=primary==='creator'?b:a;expect(remote.state.role).toBe('companion');expect(await remote.request('focus','state')).toEqual({remaining:30});expect(request).toHaveBeenCalledTimes(1);await expect(remote.request('animal','save',{})).rejects.toThrow();a.dispose();b.dispose();});
 it('rejects an expired invitation and restores controls on disconnect',async()=>{vi.useFakeTimers();const factory=network(),cb=callbacks(),gone=vi.fn();cb.disconnected=gone;const a=new CompanionSession(cb,factory);await a.invite('A');await vi.advanceTimersByTimeAsync(302000);expect(a.state.phase).toBe('disconnected');expect(a.state.error).toContain('caducado');expect(gone).toHaveBeenCalled();a.dispose();vi.useRealTimers();});
 it('retains individual object edits from both devices and rejects conflicting text',()=>{const base=newNotebook('Notes'),a=structuredClone(base),b=structuredClone(base);a.pages[0].text='A';b.pages.push(newPage('B'));const afterA=applyNotebookEdit(base,notebookEdit(base,a)),combined=applyNotebookEdit(afterA,notebookEdit(base,b));expect(combined.pages[0].text).toBe('A');expect(combined.pages).toHaveLength(2);const conflict=structuredClone(base);conflict.pages[0].text='Different';expect(()=>applyNotebookEdit(afterA,notebookEdit(base,conflict))).toThrow('Otra ventana');});
 it('invalid packet fragments do not produce executable messages',()=>{const receiver=new InkPackets();expect(receiver.receive('peer',JSON.stringify({v:1,scope:'village',id:crypto.randomUUID(),index:0,count:999999,body:'{}'}))).toBeNull();});
});
