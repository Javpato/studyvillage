import { describe,it,expect,vi } from 'vitest';
import { ServerOllama, type OllamaConfig } from '../src/ollama';
import { botDrawingPng } from '../src/bot-image';

const config:OllamaConfig={enabled:true,url:'http://127.0.0.1:11434',model:'local:test',features:['board','gartic']};
const input={feature:'board' as const,prompt:'Explain my selected text',images:[]};
function fixture(generate:(init:RequestInit)=>Promise<Response>=async()=>Response.json({response:JSON.stringify({steps:['One'],hint:'Check'})}),vision=false) {
  return vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>String(url).endsWith('/api/tags')?Response.json({models:[{name:'local:test'}]}):String(url).endsWith('/api/show')?Response.json({capabilities:vision?['completion','vision']:['completion']}):generate(init!));
}
describe('operator-owned Ollama service',()=>{
 it('stays off without opt-in and rejects unavailable vision without generation',async()=>{
  const fetcher=fixture(),off=new ServerOllama({...config,enabled:false},fetcher);
  expect((await off.status()).features).toEqual([]);expect(fetcher).not.toHaveBeenCalled();await expect(off.generate('a','request1',input)).rejects.toMatchObject({code:'ai-unavailable'});
  const service=new ServerOllama(config,fetcher);expect((await service.status()).features).toEqual(['board']);await expect(service.generate('a','request2',{...input,feature:'gartic'})).rejects.toMatchObject({code:'ai-unavailable'});
  expect(fetcher.mock.calls.every(([url])=>!String(url).endsWith('/api/generate'))).toBe(true);service.dispose();
 });
 it('validates content and fixes the operator URL/model regardless of participant data',async()=>{
  const fetcher=fixture(),service=new ServerOllama(config,fetcher);
  await expect(service.generate('a','request1',{...input,url:'http://private.invalid'} as typeof input)).rejects.toMatchObject({code:'ai-response'});
  expect(await service.generate('a','request2',input)).toEqual({steps:['One'],hint:'Check'});
  const [url,options]=fetcher.mock.calls.at(-1)!;expect(url).toBe('http://127.0.0.1:11434/api/generate');expect(JSON.parse(options!.body as string)).toMatchObject({model:'local:test',stream:false});service.dispose();
 });
 it('bounds jobs, isolates cancellation by person, and proceeds to the next queued request',async()=>{
  let start!:()=>void;const started=new Promise<void>(r=>start=r);
  const fetcher=fixture(async init=>{start();return new Promise((_,reject)=>init.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));});
  const service=new ServerOllama(config,fetcher),first=service.generate('alice','request1',input);const rejected=expect(first).rejects.toMatchObject({code:'cancelled'});await started;
  await expect(service.generate('alice','request2',input)).rejects.toMatchObject({code:'ai-busy'});
  const second=service.generate('bob','request3',input),secondRejected=expect(second).rejects.toMatchObject({code:'cancelled'});
  service.cancel('mallory','request1');await expect(service.generate('alice','request4',input)).rejects.toMatchObject({code:'ai-busy'});
  service.cancel('bob');await secondRejected;service.cancel('alice','request1');await rejected;service.dispose();
 });
 it('times out requests and rejects malformed model output without fake fallback',async()=>{
  const slow=new ServerOllama({...config,timeoutMs:15},fixture(init=>new Promise((_,reject)=>init.signal!.addEventListener('abort',()=>reject(new Error('aborted'))))));
  await expect(slow.generate('alice','request1',input)).rejects.toMatchObject({code:'cancelled'});slow.dispose();
  const malformed=new ServerOllama(config,fixture(async()=>Response.json({response:'{"steps":[],"hint":""}'})));
  await expect(malformed.generate('alice','request2',input)).rejects.toMatchObject({code:'ai-response'});malformed.dispose();
 });
 it('encodes only the bounded selected drawing as a PNG for server-side bots',()=>{
  const png=Buffer.from(botDrawingPng({strokes:[{c:'#000000',w:8,p:[0,0,640,400]}]}),'base64');expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);expect(png.readUInt32BE(16)).toBe(160);expect(png.readUInt32BE(20)).toBe(100);expect(png.length).toBeLessThan(10000);
 });
});
