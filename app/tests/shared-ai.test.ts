import { describe,it,expect,vi } from 'vitest';
import { SharedAi } from '../../packages/runtime/src/ai/shared-ai';
import { LocalOllama } from '../../packages/runtime/src/ai/local-ollama';
import type { AppMessage,AppActions } from '../../packages/core/src/protocol/types';
import type { AiProvider,AiStatus } from '../../packages/runtime/src/ai/contracts';

describe('shared AI host authority',()=>{
 it('mobile/browser hosts cannot configure or serve local Ollama',async()=>{
  const ai=new LocalOllama(()=>false);expect(ai.configurable()).toBe(false);expect((await ai.provider().status()).features).toEqual([]);
  await expect(ai.detect()).rejects.toMatchObject({code:'ai-unavailable'});await expect(ai.provider().generate('guest','request1',{feature:'board',prompt:'Hello',images:[]})).rejects.toMatchObject({code:'ai-unavailable'});ai.dispose();
 });
 it('sends selected content only to the host and ignores a guest offering AI',async()=>{
  const sent:{to:string|null;data:string}[]=[];let receive!:(message:AppMessage)=>void;
  const actions:Pick<AppActions,'sendApp'|'onApp'>={sendApp:(_channel,to,data)=>{sent.push({to,data});return true;},onApp:fn=>{receive=fn;return()=>{};}};
  const provider:AiProvider={status:vi.fn(async()=>({features:[],model:''})),generate:vi.fn(),cancel:vi.fn()};let status:AiStatus|null=null;
  const shared=new SharedAi(actions,()=>({selfId:'guest',hostId:'host',sessionId:'session'}),provider,s=>status=s);shared.sync();
  const statusId=JSON.parse(sent[0].data).id;
  receive({channel:'ai',from:'intruder',data:JSON.stringify({t:'result',id:statusId,value:{features:['board'],model:'guest-model'}})});await Promise.resolve();expect(status).toEqual({features:[],model:''});
  receive({channel:'ai',from:'host',data:JSON.stringify({t:'result',id:statusId,value:{features:['board'],model:'host-model'}})});await vi.waitFor(()=>expect(status).toEqual({features:['board'],model:'host-model'}));
  const result=shared.generate({feature:'board',prompt:'Only this selection',images:[]},new AbortController().signal);const wire=JSON.parse(sent.at(-1)!.data);expect(sent.at(-1)!.to).toBe('host');
  receive({channel:'ai',from:'host',data:JSON.stringify({t:'result',id:wire.id,value:{steps:['Checked'],hint:'OK'}})});expect(await result).toEqual({steps:['Checked'],hint:'OK'});expect(provider.generate).not.toHaveBeenCalled();shared.dispose();
 });
});
