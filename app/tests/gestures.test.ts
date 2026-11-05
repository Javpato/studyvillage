import { describe,it,expect } from 'vitest';
import { DoubleTap,touchEnabled } from '../src/input/gestures';
import { WORLD_AREAS,closestPortal,DEFAULT_AREA_OBJECTS } from '../src/world/areas';
import { WORLD_SPAWN,PARCELS,WORLD_TREES,circleHitsRect } from '../src/world/model';
describe('direct interactions and touch-only walking',()=>{
 it('recognizes a double tap only for the same object and cancels the sequence after opening',()=>{const taps=new DoubleTap();expect(taps.accept({x:10,y:10,time:0,target:'house'})).toBe(false);expect(taps.accept({x:12,y:14,time:300,target:'house'})).toBe(true);expect(taps.accept({x:12,y:14,time:400,target:'house'})).toBe(false);expect(taps.accept({x:12,y:14,time:450,target:'board'})).toBe(false);});
 it('rejects slow taps, distant taps and empty-ground double taps',()=>{const taps=new DoubleTap();taps.accept({x:0,y:0,time:0,target:'a'});expect(taps.accept({x:0,y:0,time:500,target:'a'})).toBe(false);expect(taps.accept({x:100,y:0,time:550,target:'a'})).toBe(false);expect(taps.accept({x:100,y:0,time:600,target:null})).toBe(false);});
 it('respects explicit touch preferences even on a touchscreen',()=>{expect(touchEnabled('off',5)).toBe(false);expect(touchEnabled('auto',0)).toBe(false);expect(touchEnabled('auto',5)).toBe(true);expect(touchEnabled('on',0)).toBe(true);});
});
describe('north/south neighborhood geography',()=>{
 it('keeps six parcels and leaves both horizontal edges free for neighbor links',()=>{expect(PARCELS).toHaveLength(6);expect(WORLD_AREAS.residential.portals).toHaveLength(2);const portals=WORLD_AREAS.residential.portals;expect(portals.find(p=>p.toArea==='community')!.rect.y).toBeLessThan(WORLD_SPAWN.y);expect(portals.find(p=>p.toArea==='study')!.rect.y).toBeGreaterThan(WORLD_SPAWN.y);});
 it('has safe reciprocal arrivals in all six-parcel configurations',()=>{for(const area of Object.values(WORLD_AREAS))for(const portal of area.portals){const pos=portal.spawnAtTarget;const obstacles=portal.toArea==='residential'?PARCELS.map(p=>({...p,h:p.h+6})):DEFAULT_AREA_OBJECTS.filter(o=>o.areaId===portal.toArea&&o.hasCollision).map(o=>({x:o.x,y:o.y,w:o.w,h:o.h}));expect(obstacles.some(r=>circleHitsRect(pos.x,pos.y,9,r))).toBe(false);expect(closestPortal(portal.toArea,pos)?.toArea).toBe(area.id);}});
 it('arrives at a free spot when walking in from a neighbouring neighbourhood on either side',()=>{const obstacles=[...PARCELS.map(p=>({x:p.x-2,y:p.y-6,w:p.w+4,h:p.h+5})),...WORLD_TREES.map(({x,y})=>({x:x-11,y:y-16,w:22,h:25}))];for(const x of [24,768-24])expect(obstacles.some(r=>circleHitsRect(x,WORLD_SPAWN.y,9,r))).toBe(false);});
});
