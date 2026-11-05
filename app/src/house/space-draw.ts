import { sprite } from '../assets/sprite-catalog';
import { INTERACTION_REACH } from '../world/interactions';
import { fill, plate, text } from '../ui/art';
import { t } from '../i18n';
import type { PublicHouse, Position } from '../../../packages/core/src/protocol/types';
import { floorsOf, spaceKey, type HouseSpace } from './workspaces';
export interface SpacePortal { id:string; x:number; y:number; label:string; target:HouseSpace }
export function spacePortals(house:PublicHouse,space?:HouseSpace):SpacePortal[]{
  const floors=floorsOf(house);
  const positioned=(portals:Omit<SpacePortal,'id'>[]):SpacePortal[]=>portals.map(p=>{const id=`${spaceKey(space)}>${spaceKey(p.target)}`;return {...p,...house.doorPositions?.[id],id};});
  if(!space)return positioned([{x:690,y:352,label:t('Plantas privadas'),target:{floorId:floors[0].id,roomId:null}}]);
  if(space.roomId)return[];
  const index=floors.findIndex(f=>f.id===space.floorId),floor=floors[index];if(!floor)return[];
  const portals:Omit<SpacePortal,'id'>[]=floor.rooms.map((room,i)=>({x:106+i%5*138,y:i<5?144:286,label:room.name,target:{floorId:floor.id,roomId:room.id}}));
  if(index>0)portals.push({x:72,y:360,label:t('Bajar planta'),target:{floorId:floors[index-1].id,roomId:null}});
  if(index<floors.length-1)portals.push({x:692,y:360,label:t('Subir planta'),target:{floorId:floors[index+1].id,roomId:null}});
  return positioned(portals);
}
export function nearestSpacePortal(house:PublicHouse,position:Position,reach=INTERACTION_REACH):SpacePortal|null{return spacePortals(house,position.space).find(p=>Math.hypot(p.x-position.x,p.y-position.y)<=reach)??null;}
export function drawSpacePortal(ctx:CanvasRenderingContext2D,portal:SpacePortal):void{
  const{x,y}=portal;const asset=sprite('room-door');if(asset)ctx.drawImage(asset,x-22,y-40);else{ctx.save();ctx.translate(x-22,y-40);paintSpaceDoorSource(ctx);ctx.restore();}
  plate(ctx,x-55,y-60,110,17,'#f4e7cd','#705133');text(ctx,portal.label.slice(0,20),x,y-48,'#433225',8);
}

/** Drop positions belonging to deleted doors when a layout is edited. */
export function pruneDoorPositions(house:PublicHouse):PublicHouse{
  if(!house.doorPositions)return house;
  const ids=new Set([undefined,...floorsOf(house).map(f=>({floorId:f.id,roomId:null}))].flatMap(space=>spacePortals(house,space).map(p=>p.id)));
  return {...house,doorPositions:Object.fromEntries(Object.entries(house.doorPositions).filter(([id])=>ids.has(id)))};
}

export function paintSpaceDoorSource(ctx:CanvasRenderingContext2D):void {fill(ctx,'#533d2b',0,0,44,44);fill(ctx,'#a57b4e',4,4,36,38);fill(ctx,'#705133',8,10,28,24);fill(ctx,'#e8c27d',32,28,4,4);}
