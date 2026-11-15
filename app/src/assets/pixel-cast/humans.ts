import {heads,bodies,hairParts,hats,clothes,jackets,glasses} from './grids';
import {normalizeAppearance,type AvatarAppearance} from '../appearance';
type Direction='down'|'left'|'right'|'up';
function shade(color:string,amount:number):string{const n=parseInt(color.slice(1),16);return '#'+[16,8,0].map(shift=>Math.max(0,Math.min(255,((n>>shift)&255)+amount)).toString(16).padStart(2,'0')).join('');}
/** All geometry is authored on the logical grid; composition only swaps material ramps/parts. */
export function paintHuman(ctx:CanvasRenderingContext2D,look:AvatarAppearance,direction:Direction,step=0):void{
 const side=direction==='left'||direction==='right',view=side?'right':direction;
 const palette:Record<string,string>={o:'#302c40',H:look.hairColor,h:shade(look.hairColor,-25),S:look.skinTone,s:shade(look.skinTone,-29),T:look.outfitColor??'#418d8a',L:shade(look.outfitColor??'#418d8a',28),t:shade(look.outfitColor??'#418d8a',-30),P:look.pantsColor,p:shade(look.pantsColor,-25),W:'#fff0d1',A:look.headwearColor,a:shade(look.headwearColor,-30),J:look.jacketColor,j:shade(look.jacketColor,-25)};
 const grid=(rows:readonly string[],x:number,y:number)=>rows.forEach((row,dy)=>[...row].forEach((key,dx)=>{if(palette[key]){ctx.fillStyle=palette[key];ctx.fillRect(x+dx,y+dy,1,1);}}));
 ctx.save();if(direction==='left'){ctx.translate(32,0);ctx.scale(-1,1);}
 const bob=step? -1:0;
 grid(bodies[view].slice(0,9),9,15+bob);
 // Feet exchange contact poses, keeping a stationary ground pivot.
 grid(bodies[view].slice(9).map(r=>r.slice(0,7)),9,24-(step===2?1:0));
 grid(bodies[view].slice(9).map(r=>r.slice(7)),16,24-(step===1?1:0));
 if(!side){grid(clothes[look.outfit]??[],9,17+bob);grid(jackets[look.jacket]??[],9,16+bob);}
 else {if(look.jacket!=='none')grid(['.jjjjj.','jJJJJJj','jJJJjJj','jJJJjJj','jJJJsSj','.jjjsSj'],12,16+bob);if(look.outfit==='overalls')grid(['pppppp','pPPPPp','pPPPPp'],12,21+bob);if(look.outfit==='hoodie')grid(['ttttt','tTTTt','ttttt'],11,16+bob);if(look.outfit==='suit')grid(['WW','Wo','.o'],18,17+bob);if(look.outfit==='sporty')grid(['WW','WW','WW'],17,18+bob);if(look.outfit==='dress')grid(['.ttttt.','tTTTTTt','ttttttt'],12,22+bob);}
 if(look.hairStyle==='long'||look.body==='feminine'&&look.hairStyle==='short')grid(hairParts.long,7,11+bob);
 if(look.hairStyle==='ponytail')grid(hairParts.ponytail,side?5:21,8+bob);
 if(look.hairStyle==='bun')grid(hairParts.bun,side?6:18,1+bob);
 grid(heads[view],7,2+bob);
 if(look.hairStyle==='curly'||look.hairStyle==='spiky')grid(hairParts[look.hairStyle],8,1+bob);
 const hat=look.headwear==='none'&&look.hairStyle==='beanie'?'beanie':look.headwear;grid(hats[hat]??[],7,1+bob);
 if(direction!=='up')grid(side?(look.eyewear==='none'?[]:['oooo','oWWo','oooo']):glasses[look.eyewear]??[],side?20:11,11+bob);
 if(look.accessory==='headphones'){palette.A=look.headphonesColor;palette.a=shade(look.headphonesColor,-28);grid(['...oooooooooo...','..o..........o..','.o............o.','o..............o','o..............o','o..............o','aa............aa','Aa............Aa','Aa............Aa','aa............aa'],8,3+bob);}
 ctx.restore();
}
export function humanSheet(input:Partial<AvatarAppearance>,color='#418d8a'):HTMLCanvasElement{
 const look=normalizeAppearance(input);look.outfitColor??=color;
 const logical=document.createElement('canvas');logical.width=96;logical.height=128;const c=logical.getContext('2d')!;
 for(const [row,direction]of (['down','left','right','up'] as const).entries())for(let col=0;col<3;col++){c.save();c.translate(col*32,row*32);paintHuman(c,look,direction,col);c.restore();}
 const out=document.createElement('canvas');out.width=192;out.height=256;const ctx=out.getContext('2d')!;ctx.imageSmoothingEnabled=false;ctx.drawImage(logical,0,0,192,256);return out;
}
export const CAST_PRESETS:Record<string,Partial<AvatarAppearance>>={
 protagonist:{headwear:'cap',headwearColor:'#4f9990',outfitColor:'#e9bd65',outfit:'overalls',pantsColor:'#536681',hairColor:'#65505a'},
 heroine:{body:'feminine',hairStyle:'ponytail',headwear:'beret',headwearColor:'#b85d79',outfitColor:'#7b9b8d',outfit:'hoodie',hairColor:'#554157'},
 'guide-wolves':{hairStyle:'curly',hairColor:'#e3d6bb',outfit:'suit',outfitColor:'#765e8b',eyewear:'round',skinTone:'#b97f60'},
 'guide-drawing':{body:'feminine',hairStyle:'bun',headwear:'beret',headwearColor:'#db9c54',outfit:'overalls',outfitColor:'#b86c78',pantsColor:'#617d91'},
 'guide-tetris':{hairStyle:'spiky',hairColor:'#765348',outfit:'sporty',outfitColor:'#638eaf',accessory:'headphones',headphonesColor:'#d49b62'},
 'guide-ollama':{hairStyle:'long',hairColor:'#403649',outfitColor:'#6ca495',jacket:'coat',jacketColor:'#e5cfaa',eyewear:'square',skinTone:'#c89473'},
 'guide-study':{body:'feminine',hairStyle:'ponytail',hairColor:'#956547',outfit:'dress',outfitColor:'#7e829d',jacket:'cardigan',jacketColor:'#dbac6b',eyewear:'round'}
};
