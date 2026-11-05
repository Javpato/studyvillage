import type {Furniture} from '../../../packages/core/src/protocol/types';
import {furnitureRect} from './model';
/** Integer quarter-turn matrices keep the complete artwork inside its rotated footprint. */
export function furniturePaintTransform(item:Furniture):[number,number,number,number,number,number]{
 const {w,h}=furnitureRect({...item,rotation:0});
 switch(item.rotation){
  case 90:return[0,1,-1,0,item.x+h,item.y];
  case 180:return[-1,0,0,-1,item.x+w,item.y+h];
  case 270:return[0,-1,1,0,item.x,item.y+w];
  default:return[1,0,0,1,item.x,item.y];
 }
}
