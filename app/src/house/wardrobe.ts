import type { PublicHouse } from '../../../packages/core/src/protocol/types';
import { LIMITS } from '../../../packages/core/src/protocol/types';
import { placementError } from './decoration';

/** One-time installation, without shifting furniture or obstructing an existing room. */
export function installWardrobe(house: PublicHouse): PublicHouse {
  if (house.furniture.some(f => f.kind === 'cabinet') || house.furniture.length >= LIMITS.furniture) return house;
  let id='wardrobe';while(house.furniture.some(f=>f.id===id))id+='-new';
  const spots=[{x:620,y:160},{x:560,y:160},{x:620,y:240}];
  for(let y=96;y<=328;y+=56)for(let x=48;x<=664;x+=56)spots.push({x,y});
  for(const spot of spots){
    const next:PublicHouse={...house,revision:house.revision+1,furniture:[...house.furniture,{id,kind:'cabinet',...spot,publicAlias:'Mi armario'}]};
    if(!placementError(next,id))return next;
  }
  return house;
}
