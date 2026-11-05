import { afterEach,describe,expect,it,vi } from 'vitest';
import {defaultHud,loadHud,saveHud} from '../src/input/hud-layout';
afterEach(()=>vi.unstubAllGlobals());
function storage(){const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});return data;}
describe('mobile HUD preferences',()=>{
 it('keeps phone and tablet orientations independent and persists removed controls',()=>{
  storage();const layout=defaultHud('phone-portrait');layout.interact={...layout.interact,visible:false,color:'#123456',scale:1.25};saveHud('phone-portrait',layout);
  expect(loadHud('phone-portrait').interact).toMatchObject({visible:false,color:'#123456',scale:1.25});expect(loadHud('phone-landscape')).toEqual(defaultHud('phone-landscape'));expect(loadHud('tablet-portrait').interact.visible).toBe(true);
 });
 it('falls back safely without destroying corrupt stored preferences',()=>{
  const data=storage();data.set('studyvillage-hud-layout-v1','broken');expect(loadHud('phone-portrait')).toEqual(defaultHud('phone-portrait'));expect(data.get('studyvillage-hud-layout-v1')).toBe('broken');
 });
 it('rejects attempts to add the protected menu or save unusable sizes',()=>{
  storage();expect(()=>saveHud('phone-portrait',{...defaultHud('phone-portrait'),menu:{visible:false}} as never)).toThrow();const layout=defaultHud('phone-portrait');layout.interact.scale=0;expect(()=>saveHud('phone-portrait',layout)).toThrow();
 });
});

it('adds camera placement to older HUD layouts without losing custom positions',()=>{
 const data=storage(),old=defaultHud('phone-portrait') as Partial<ReturnType<typeof defaultHud>>;
 old.interact={...old.interact!,x:71,visible:false};delete old.camera;
 data.set('studyvillage-hud-layout-v1',JSON.stringify({'phone-portrait':old}));
 const migrated=loadHud('phone-portrait');expect(migrated.interact).toMatchObject({x:71,visible:false});expect(migrated.camera.visible).toBe(true);
});
