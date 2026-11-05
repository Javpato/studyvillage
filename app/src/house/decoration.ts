import type { Furniture, PublicHouse } from '../../../packages/core/src/protocol/types';
import { circleHitsRect, findPath } from '../world/model';
import { HOUSE_BOUNDS, HOUSE_DOOR, HOUSE_SPAWN, furnitureRect, houseObstacles } from './model';
export function placementError(house: PublicHouse, changedId: string, entrances: readonly {x:number;y:number}[] = []): string | null {
  const item=house.furniture.find(f=>f.id===changedId);if(!item)return null;
  const rect=furnitureRect(item);const b=HOUSE_BOUNDS;
  if(rect.x<b.x||rect.y<b.y||rect.x+rect.w>b.x+b.w||rect.y+rect.h>b.y+b.h)return 'El mueble queda fuera de la habitación.';
  for(const other of house.furniture){if(other.id===item.id)continue;const r=furnitureRect(other);if(rect.x<r.x+r.w&&rect.x+rect.w>r.x&&rect.y<r.y+r.h&&rect.y+rect.h>r.y)return 'Los muebles se solapan.';}
  const obstacles=houseObstacles(house);
  if(obstacles.some(r=>circleHitsRect(HOUSE_SPAWN.x,HOUSE_SPAWN.y,9,r))||!findPath(HOUSE_SPAWN,{x:HOUSE_DOOR.x,y:HOUSE_DOOR.y-14},obstacles,HOUSE_BOUNDS))return 'Deja libre la entrada y el camino a la puerta.';
  for(const door of entrances){
    // Keep both the visible doorway and its walking approach clear.
    const area={x:door.x-26,y:door.y-44,w:52,h:66};
    if(house.furniture.map(furnitureRect).some(r=>area.x<r.x+r.w&&area.x+area.w>r.x&&area.y<r.y+r.h&&area.y+area.h>r.y)
      ||!findPath(HOUSE_SPAWN,{x:door.x,y:door.y+16},obstacles,HOUSE_BOUNDS))return 'Deja libre el acceso a las puertas.';
  }
  for(const f of house.furniture.filter(f=>['desk','bookshelf','board','cabinet','table'].includes(f.kind))){
    const r=furnitureRect(f);const points=[{x:r.x+r.w/2,y:r.y+r.h+14},{x:r.x+r.w/2,y:r.y-14},{x:r.x-14,y:r.y+r.h/2},{x:r.x+r.w+14,y:r.y+r.h/2}];
    if(!points.some(p=>p.x>=b.x+9&&p.x<=b.x+b.w-9&&p.y>=b.y+9&&p.y<=b.y+b.h-9&&!obstacles.some(o=>circleHitsRect(p.x,p.y,9,o))&&findPath(HOUSE_SPAWN,p,obstacles,b)))return 'Ese cambio impide acceder a un mueble.';
  }
  return null;
}
export class DecorationHistory {
  private undoStack: Furniture[][]=[];private redoStack: Furniture[][]=[];
  remember(house: PublicHouse): void {this.undoStack.push(structuredClone(house.furniture));if(this.undoStack.length>50)this.undoStack.shift();this.redoStack=[];}
  undo(house: PublicHouse): PublicHouse|null {const previous=this.undoStack.pop();if(!previous)return null;this.redoStack.push(structuredClone(house.furniture));return {...house,furniture:previous,revision:house.revision+1};}
  redo(house: PublicHouse): PublicHouse|null {const next=this.redoStack.pop();if(!next)return null;this.undoStack.push(structuredClone(house.furniture));return {...house,furniture:next,revision:house.revision+1};}
}
