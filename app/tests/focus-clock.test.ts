import {describe,it,expect} from 'vitest';
import {FocusClockModel,newFocusClockState,parseFocusClockState,durationFromFields,formatClock} from '../src/ui/focus-clock-model';
describe('focus clock duration and suspended-browser recovery',()=>{
 it('accepts hours and seconds and rejects impossible or empty durations',()=>{
  expect(durationFromFields('1','02','03')).toBe(3723);expect(durationFromFields('','','7')).toBe(7);expect(formatClock(3723)).toBe('01:02:03');expect(formatClock(59)).toBe('00:59');
  for(const fields of [['0','0','0'],['24','0','0'],['1','60','0'],['0','1','-1'],['0','2','1.5'],['0','2','x']])expect(durationFromFields(...fields as [string,string,string])).toBeNull();
 });
 it('uses the deadline after suspension and preserves the paused remainder across reload',()=>{
  let now=1000;const model=new FocusClockModel(undefined,()=>now);model.setDuration(3723);model.start();now+=50_000;expect(model.tick()).toBe(false);expect(model.state.remaining).toBe(3673);model.pause();now+=300_000;
  const reopened=new FocusClockModel(JSON.parse(JSON.stringify(model.state)),()=>now);expect(reopened.running).toBe(false);expect(reopened.state.remaining).toBe(3673);reopened.start();now+=3_673_001;expect(reopened.tick()).toBe(true);expect(reopened.state.mode).toBe('break');expect(reopened.state.remaining).toBe(300);expect(reopened.running).toBe(true);expect(reopened.tick()).toBe(false);
 });
 it('repeats cycles, applies edits only to future phases and keeps visibility independent',()=>{
  let now=0;const model=new FocusClockModel(undefined,()=>now);model.setDuration(2,'focus');model.setDuration(1,'break');model.start();model.state.hud=false;
  now=1000;model.tick();model.setDuration(4,'focus');expect(model.state.remaining).toBe(1);model.pause();now=9000;model.start();expect(model.state.deadline).toBe(10000);
  now=10000;model.tick();expect(model.state.mode).toBe('break');model.pause();now=12000;model.start();now=13000;model.tick();expect(model.state.mode).toBe('focus');expect(model.state.remaining).toBe(4);
  now=23000;model.tick();expect(model.state.mode).toBe('focus');expect(model.state.remaining).toBe(4);expect(model.visible).toBe(false);
  model.reset();now+=100000;expect(model.tick()).toBe(false);expect(model.state).toMatchObject({mode:'focus',status:'idle',remaining:4});
 });
 it('skips years of delayed callbacks without replaying alerts',()=>{let now=0;const model=new FocusClockModel(undefined,()=>now);model.start();now=10*365*86400000+10_000;expect(model.tick()).toBe(true);expect(model.state.remaining).toBeGreaterThan(0);expect(model.state.deadline).toBeGreaterThan(now);expect(model.tick()).toBe(false);});
 it('rejects damaged persistence without accepting an unbounded timer or offscreen HUD',()=>{
  expect(()=>parseFocusClockState({...newFocusClockState(),position:{x:50,y:1}})).toThrow();expect(()=>parseFocusClockState({...newFocusClockState(),deadline:NaN})).toThrow();expect(()=>parseFocusClockState({...newFocusClockState(),remaining:Infinity})).toThrow();
 });
});

describe('saved timer programs',()=>{
 const program={id:'study',name:'Révisions',repeat:false,steps:[{id:'a',name:'Focus',seconds:1500},{id:'b',name:'Pause',seconds:300},{id:'c',name:'Lecture',seconds:2700}]};
 it('runs 25 → 5 → 45 minutes once, freezes both phases and retains active edits separately',()=>{
  let now=0;const model=new FocusClockModel(undefined,()=>now);model.saveProgram(program);model.selectProgram('study');model.start();now=1500000;expect(model.tick()).toBe(true);expect(model.state.stepIndex).toBe(1);expect(model.state.remaining).toBe(300);model.pause();now+=700000;model.start();now+=300000;model.tick();expect(model.state.stepIndex).toBe(2);model.saveProgram({...program,steps:[{id:'x',name:'New',seconds:1}]});expect(model.state.run?.steps).toHaveLength(3);
  const restored=new FocusClockModel(JSON.parse(JSON.stringify(model.state)),()=>now);expect(restored.state.stepIndex).toBe(2);now+=2700000;expect(restored.tick()).toBe(true);expect(restored.state).toMatchObject({status:'finished',remaining:0,deadline:null});expect(restored.tick()).toBe(false);restored.start();expect(restored.state.activeDuration).toBe(1);
 });
 it('repeats without drift after years suspended and emits only one transition record',()=>{let now=0;const m=new FocusClockModel(undefined,()=>now);m.saveProgram({...program,repeat:true});m.selectProgram('study');m.start();now=4500000*100000+1501000;expect(m.tick()).toBe(true);expect(m.state.stepIndex).toBe(1);expect(m.state.remaining).toBe(299);expect(m.state.alert.id).toBe(1);expect(m.tick()).toBe(false);m.stop();now+=999999999;expect(m.tick()).toBe(false);expect(m.state.status).toBe('idle');});
 it('migrates an existing paused/running Pomodoro without changing its deadline',()=>{const old={...newFocusClockState(),version:1,mode:'break',remaining:70,activeDuration:300,status:'running',deadline:123456,started:true};const migrated=parseFocusClockState(old);expect(migrated).toMatchObject({version:2,mode:'break',remaining:70,deadline:123456,status:'running',programs:[]});});
 it('keeps a running copy after deleting its saved program and validates bounded sequences',()=>{let now=0;const m=new FocusClockModel(undefined,()=>now);m.saveProgram(program);m.selectProgram('study');m.start();m.deleteProgram('study');expect(m.state.run?.name).toBe('Révisions');expect(()=>parseFocusClockState(m.state)).not.toThrow();now=4500000;m.pause();expect(m.state.status).toBe('finished');for(const seconds of [0,-1,NaN,Infinity,86400])expect(()=>m.saveProgram({...program,steps:[{id:'a',name:'A',seconds}]})).toThrow();expect(()=>m.saveProgram({...program,steps:[]})).toThrow();});
});
