import {it,expect} from 'vitest';
import {clampWindow} from '../src/input/media-window';
import {axisDirection} from '../src/input/gamepad';
it('keeps a moved window reachable after rotation or keyboard appearance',()=>{const r=clampWindow({x:1200,y:800,width:800,height:600},390,280);expect(r.x+r.width).toBeLessThanOrEqual(382);expect(r.y+r.height).toBeLessThanOrEqual(272);expect(r.x).toBeGreaterThanOrEqual(8);});
it('ignores controller drift',()=>{expect(axisDirection(.2)).toBe(0);expect(axisDirection(-.5)).toBe(-1);});
