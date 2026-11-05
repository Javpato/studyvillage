import {describe,it,expect} from 'vitest';
import {FocusClockModel,newFocusClockState,parseFocusClockState,durationFromFields,formatClock} from '../src/ui/focus-clock-model';
describe('focus clock duration and suspended-browser recovery',()=>{
 it('accepts hours and seconds and rejects impossible or empty durations',()=>{
  expect(durationFromFields('1','02','03')).toBe(3723);expect(durationFromFields('','','7')).toBe(7);expect(formatClock(3723)).toBe('01:02:03');expect(formatClock(59)).toBe('00:59');
  for(const fields of [['0','0','0'],['24','0','0'],['1','60','0'],['0','1','-1'],['0','2','1.5'],['0','2','x']])expect(durationFromFields(...fields as [string,string,string])).toBeNull();
 });
 it('uses the deadline after suspension and preserves the paused remainder across reload',()=>{
  let now=1000;const model=new FocusClockModel(undefined,()=>now);model.setDuration(3723);model.start();now+=50_000;expect(model.tick()).toBe(false);expect(model.state.remaining).toBe(3673);model.pause();now+=300_000;
  const reopened=new FocusClockModel(JSON.parse(JSON.stringify(model.state)),()=>now);expect(reopened.running).toBe(false);expect(reopened.state.remaining).toBe(3673);reopened.start();now+=3_673_001;expect(reopened.tick()).toBe(true);expect(reopened.state.remaining).toBe(0);expect(reopened.running).toBe(false);expect(reopened.tick()).toBe(false);
 });
 it('keeps focus and break durations separate and respects explicit HUD hiding',()=>{
  const model=new FocusClockModel();expect(model.visible).toBe(false);model.setDuration(90);model.start();expect(model.visible).toBe(true);model.state.hud=false;model.pause();model.setMode('break');expect(model.state.remaining).toBe(300);model.setDuration(12);model.start();expect(model.visible).toBe(false);model.setMode('focus');expect(model.state.remaining).toBe(90);model.setMode('break');expect(model.state.remaining).toBe(12);
  const reopened=new FocusClockModel(JSON.parse(JSON.stringify(model.state)));expect(reopened.visible).toBe(false);
 });
 it('rejects damaged persistence without accepting an unbounded timer or offscreen HUD',()=>{
  expect(()=>parseFocusClockState({...newFocusClockState(),position:{x:50,y:1}})).toThrow();expect(()=>parseFocusClockState({...newFocusClockState(),deadline:NaN})).toThrow();expect(()=>parseFocusClockState({...newFocusClockState(),remaining:Infinity})).toThrow();
 });
});
