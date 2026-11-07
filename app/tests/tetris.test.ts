import {describe,it,expect} from 'vitest';
import {TetrisGame,cells,fits,type TetrisPlayer,type TetrisAction,type TetrisView} from '../../packages/core/src/minigames/tetris';
function start(count=2,solo=false){const g=new TetrisGame(42,solo);for(let i=0;i<count;i++){g.apply(String(i),{type:'join',name:`Player ${i}`},0);g.apply(String(i),{type:'ready',ready:true},0);}g.apply('0',{type:'start'},0);g.tick(3000);return g;}
const player=(g:TetrisGame,id='0')=>g.viewFor(id,3000).players.find(p=>p.id===id)!;
// Controlled board fixtures exercise public actions, including collision and attack application.
const fixture=(g:TetrisGame,id='0')=>(g as unknown as {players:Map<string,TetrisPlayer>}).players.get(id)!;
describe('forest blocks authority',()=>{
 it('starts 16 equal seeded sequences, rejects a seventeenth and unauthorized starts',()=>{const g=start(16);expect(g.audience()).toHaveLength(16);expect(new Set(g.viewFor('0',3000).players.map(p=>JSON.stringify([p.piece,p.next]))).size).toBe(1);expect(()=>g.apply('17',{type:'join',name:'Extra'},3100)).toThrow();expect(()=>g.apply('1',{type:'start'},3100)).toThrow();});
 it('validates actions and ignores duplicates and obsolete rounds',()=>{const g=start();const a={type:'input',round:1,seq:1,key:'left'} as const;g.apply('0',a,3100);expect(player(g).piece.x).toBe(2);g.apply('0',a,3200);g.apply('0',{...a,round:0,seq:2},3300);expect(player(g).piece.x).toBe(2);expect(()=>g.apply('0',{...a,board:[]} as never,3400)).toThrow();});
 it('keeps all rotations in bounds, holds once per piece and drops to a legal board',()=>{const g=start(1,true);for(let i=0;i<12;i++)g.apply('0',{type:'input',round:1,seq:i,key:'left'},3100+i*30);expect(cells(player(g).piece).every(([x])=>x>=0)).toBe(true);g.apply('0',{type:'input',round:1,seq:20,key:'hold'},3600);const held=player(g).hold;g.apply('0',{type:'input',round:1,seq:21,key:'hold'},3700);expect(player(g).hold).toBe(held);g.apply('0',{type:'input',round:1,seq:22,key:'drop'},3800);expect(player(g).board.flat().filter(Boolean)).toHaveLength(4);expect(fits(player(g).board,player(g).piece)).toBe(true);});
 it('scores a four-line clear and queues four delayed stone rows',()=>{const g=start();const p=fixture(g);p.piece={kind:0,rotation:1,x:2,y:16};for(let y=16;y<20;y++)p.board[y]=Array.from({length:10},(_,x)=>x===4?0:1);g.apply('0',{type:'input',round:1,seq:1,key:'drop',target:'1'},3100);expect(player(g).lines).toBe(4);expect(player(g).score).toBe(800);expect(player(g,'1').pending).toEqual([expect.objectContaining({rows:4,at:6100})]);});
 it('stones resist lines, moss transforms only four rows and shield cancels pending attacks',()=>{const g=start();const p=fixture(g);p.energy=100;for(let y=15;y<20;y++)p.board[y]=Array(10).fill(8);p.piece={kind:1,rotation:0,x:3,y:0};g.apply('0',{type:'input',round:1,seq:1,key:'moss'},3100);expect(player(g).board[15]).toContain(8);expect(player(g).board[16]).not.toContain(8);p.pending=[{rows:6,at:4000,hole:2}];p.cooldown=0;g.apply('0',{type:'input',round:1,seq:2,key:'shield'},3200);expect(player(g).pending[0].rows).toBe(2);expect(player(g).energy).toBe(30);});
 it('disconnect grace ends the round and a local pause shifts simulation clocks',()=>{const g=start();g.apply('0',{type:'ping'},15000);g.tick(16000);expect(g.viewFor('0',16000).winner).toBe('0');const solo=start(1,true),before=player(solo).piece;solo.postpone(60000);solo.tick(63000);expect(player(solo).piece).toEqual(before);});
 it('isolates games and allows late arrivals only as spectators',()=>{const g=start(),other=start();g.apply('late',{type:'join',name:'Late'},3100);expect(player(g,'late').alive).toBe(false);g.apply('0',{type:'input',round:1,seq:1,key:'drop'},3200);expect(player(other).board.flat().some(Boolean)).toBe(false);});
});

import {vi} from 'vitest';
import {SharedRoom} from '../../packages/runtime/src/session/shared-room';
import type {AppChannel,AppMessage} from '../../packages/core/src/protocol/types';
it('reconciles 16 network clients with delayed messages and disconnects without cross-room actions',async()=>{
 vi.useFakeTimers();vi.setSystemTime(100000);const listeners=new Map<string,Set<(m:AppMessage)=>void>>();let deliveries=0;
 const actions=(self:string)=>({sendApp:(channel:AppChannel,to:string|null,data:string)=>{if(!to)return false;setTimeout(()=>{for(const listener of listeners.get(to)??[]){deliveries++;listener({channel,from:self,data});}},60);return true;},onApp:(fn:(m:AppMessage)=>void)=>{const set=listeners.get(self)??new Set();set.add(fn);listeners.set(self,set);return()=>{set.delete(fn);};}});
 const rooms=Array.from({length:16},(_,i)=>new SharedRoom<TetrisAction,TetrisView,TetrisGame>('tetris',actions(String(i)),()=>({selfId:String(i),hostId:'0'}),()=>new TetrisGame(123)));
 try{rooms.forEach(r=>r.sync());rooms.forEach((r,i)=>r.act({type:'join',name:`Player ${i}`}));await vi.advanceTimersByTimeAsync(200);rooms.forEach(r=>r.act({type:'ready',ready:true}));await vi.advanceTimersByTimeAsync(200);rooms[0].act({type:'start'});await vi.advanceTimersByTimeAsync(3300);expect(rooms.every(r=>r.current()?.phase==='playing')).toBe(true);rooms[7].act({type:'input',round:1,seq:1,key:'left'});await vi.advanceTimersByTimeAsync(250);expect(rooms[0].current()!.players.find(p=>p.id==='7')!.piece.x).toBe(2);expect(rooms[7].current()!.players.find(p=>p.id==='7')!.seq).toBe(1);expect(deliveries).toBeLessThan(2500);listeners.delete('8');for(const r of rooms.filter((_,i)=>i!==8))r.act({type:'ping'});await vi.advanceTimersByTimeAsync(14000);for(const r of rooms.filter((_,i)=>i!==8))r.act({type:'ping'});await vi.advanceTimersByTimeAsync(2000);expect(rooms[0].current()!.players.find(p=>p.id==='8')!.alive).toBe(false);}finally{rooms.forEach(r=>r.dispose());vi.useRealTimers();}
});

import {TETRIS_DIFFICULTIES,type TetrisDifficulty,botMove} from '../../packages/core/src/minigames/tetris';
for(const difficulty of ['easy','normal','hard'] as const)it(`uses ${difficulty} gravity, warning time and a shared bag with just one preview`,()=>{
 const g=start();g.cancel();g.apply('0',{type:'difficulty',difficulty},4000);for(const id of ['0','1'])g.apply(id,{type:'ready',ready:true},4000);g.apply('0',{type:'start'},4000);g.tick(7000);
 const a=player(g),b=player(g,'1');expect(a.next).toHaveLength(1);expect([a.piece,a.next]).toEqual([b.piece,b.next]);g.tick(7000+TETRIS_DIFFICULTIES[difficulty].gravity-1);expect(player(g).piece.y).toBe(a.piece.y);g.tick(7000+TETRIS_DIFFICULTIES[difficulty].gravity);expect(player(g).piece.y).toBe(a.piece.y+1);
 fixture(g).energy=100;g.apply('0',{type:'input',round:2,seq:1,key:'roots',target:'1'},9000);expect(player(g,'1').pending[0].at).toBe(9000+TETRIS_DIFFICULTIES[difficulty].warning);
 const engine=g as unknown as {number:(index:number)=>number};const bag=Array.from({length:difficulty==='hard'?13:7},(_,i)=>engine.number(i));expect(bag.filter(k=>k===0)).toHaveLength(1);expect(new Set(bag).size).toBe(7);
});
it('lets only the organizer set difficulty or bots before a round, resets human readiness and caps bots',()=>{
 const g=new TetrisGame(42);for(const id of ['0','1']){g.apply(id,{type:'join',name:id},0);g.apply(id,{type:'ready',ready:true},0);}
 expect(()=>g.apply('1',{type:'difficulty',difficulty:'hard'},1)).toThrow();expect(()=>g.apply('1',{type:'bot',operation:'add'},1)).toThrow();
 for(let n=0;n<3;n++)g.apply('0',{type:'bot',operation:'add'},1);expect(()=>g.apply('0',{type:'bot',operation:'add'},1)).toThrow();g.apply('0',{type:'difficulty',difficulty:'hard'},1);
 expect(g.viewFor('0',1).players.every(p=>p.ready===!!p.bot)).toBe(true);expect(g.audience()).toEqual(['0','1']);
 for(const id of ['0','1'])g.apply(id,{type:'ready',ready:true},1);g.apply('0',{type:'start'},1);expect(()=>g.apply('0',{type:'difficulty',difficulty:'easy'},2)).toThrow();expect(()=>g.apply('0',{type:'bot',operation:'remove',id:'tetris-npc:1'},2)).toThrow();
});
it('NPCs execute legal moves, clear lines and survive heartbeats without a client',()=>{
 const g=new TetrisGame(42,false,false,'hard');g.apply('human',{type:'join',name:'Human'},0);g.apply('human',{type:'bot',operation:'add'},0);g.apply('human',{type:'ready',ready:true},0);g.apply('human',{type:'start'},0);g.tick(3000);
 const bot=fixture(g,'tetris-npc:1');bot.piece={kind:0,rotation:1,x:2,y:16};for(let y=16;y<20;y++)bot.board[y]=Array.from({length:10},(_,x)=>x===4?0:1);
 expect(botMove(bot)).toBe('drop');g.tick(3120);expect(bot.lines).toBe(4);expect(bot.board.flat().some(Boolean)).toBe(false);
 for(let now=3240;now<24000;now+=120){g.apply('human',{type:'ping'},now);g.tick(now);}expect(bot.alive).toBe(true);expect(bot.seq).toBeGreaterThan(20);expect(bot.board.every(r=>r.length===10)).toBe(true);expect(bot.next).toHaveLength(1);
});
it('never promotes an NPC to organizer and removes orphaned bots',()=>{const g=new TetrisGame(1);g.apply('host',{type:'join',name:'Host'},0);g.apply('host',{type:'bot',operation:'add'},0);g.apply('host',{type:'leave'},1);g.tick(2);expect(g.viewFor('host',2)).toMatchObject({host:null,players:[]});});
