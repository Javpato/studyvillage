import {describe,it,expect} from 'vitest';
import {Friends} from '../../packages/core/src/social/friends';
const people=['a','b','c'].map(x=>({fingerprint:x.repeat(64),publicKey:'k'.repeat(100),displayName:x,color:'#123456'}));
const [a,b,c]=people;
describe('private friendship requests',()=>{
 it('deduplicates requests, authorizes responses and synchronizes an offline sender after restart',()=>{
  const hub=new Friends();hub.apply(a.fingerprint,{action:'request',target:b.fingerprint},people);hub.apply(a.fingerprint,{action:'request',target:b.fingerprint},people);
  const request=hub.view(b.fingerprint).incoming[0];expect(hub.view(b.fingerprint).incoming).toHaveLength(1);expect(hub.view(c.fingerprint).incoming).toHaveLength(0);
  expect(()=>hub.apply(c.fingerprint,{action:'respond',id:request.id,accept:true},people)).toThrow();
  hub.apply(b.fingerprint,{action:'respond',id:request.id,accept:true},[b]);
  const restored=new Friends(JSON.parse(JSON.stringify(hub.records)));expect(restored.view(a.fingerprint).accepted).toEqual([b]);expect(restored.view(b.fingerprint).accepted).toEqual([a]);expect(restored.view(c.fingerprint).accepted).toEqual([]);
 });
 it('supports reject/cancel and refuses self and offline targets',()=>{
  const hub=new Friends();expect(()=>hub.apply(a.fingerprint,{action:'request',target:a.fingerprint},people)).toThrow();expect(()=>hub.apply(a.fingerprint,{action:'request',target:b.fingerprint},[a])).toThrow();
  for(const action of ['cancel','respond'] as const){hub.apply(a.fingerprint,{action:'request',target:b.fingerprint},people);const id=hub.view(b.fingerprint).incoming[0].id;hub.apply(action==='cancel'?a.fingerprint:b.fingerprint,action==='cancel'?{action,id}:{action,id,accept:false},people);expect(hub.records).toEqual([]);}
 });
});
