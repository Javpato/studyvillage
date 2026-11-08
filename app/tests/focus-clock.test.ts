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
