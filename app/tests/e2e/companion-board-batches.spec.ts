import {test,expect} from '@playwright/test';
test('companion assembles paged snapshots and sends large edits in bounded batches locally',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{
  const modulePath='/src/companion/board.ts';const {CompanionBoard}=await import(/* @vite-ignore */ modulePath);
  const author='a'.repeat(64),board=`house:${author}:board`,strokes=Array.from({length:2200},(_,i)=>({id:'bulk'+i,author,boardId:board,seq:1,color:'#123456',width:2,tool:'pen',points:[{x:1,y:2}],deleted:false}));
  const state={board,author,strokes,canEdit:true,moderate:true,configure:true,display:false,metadata:{boardId:board,displayName:'Test',areaId:'house',ownerId:author,customSpriteDataUrl:null,access:'owner_only',allowedEditors:[],revision:1}};
  const getPage=(offset:number)=>({...state,strokes:state.strokes.slice(offset,offset+100),...(offset+100<state.strokes.length?{next:{token:'test',offset:offset+100}}:{})});let pages=0;const batches:number[]=[];
  const request=async(action:string,value?:any)=>{if(action==='page'){pages++;return getPage(value.offset);}if(action==='state')return getPage(0);if(action==='commit'){batches.push(value.changes.length);const map=new Map(state.strokes.map(s=>[s.id,s]));for(const s of value.changes)map.set(s.id,s);state.strokes=[...map.values()];return {saved:true};}throw Error(action);};
  const node=document.createElement('div');document.body.append(node);const surface=new CompanionBoard({node,activate(){},changed(){},deactivate(){}},()=>{});
  try{await surface.open(getPage(0),request);const loaded=surface.all().length;await surface.commit(strokes.map(s=>({...s,seq:2,deleted:true})));return {loaded,pages,batches,deleted:surface.all().every((s:any)=>s.deleted)};}finally{surface.dispose();node.remove();}
 });expect(result.loaded).toBe(2200);expect(result.pages).toBeGreaterThan(20);expect(result.batches.length).toBeGreaterThan(1);expect(Math.max(...result.batches)).toBeLessThanOrEqual(128);expect(result.deleted).toBe(true);
});
