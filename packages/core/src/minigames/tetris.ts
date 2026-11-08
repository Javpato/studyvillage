import {PetMatch,PetReservations,petBotSchema,type PetBot} from '../pets/protocol';
import {z} from 'zod';
import type {RoomEngine} from './room';
export const tetrisDifficultySchema=z.enum(['easy','normal','hard']);
export type TetrisDifficulty=z.infer<typeof tetrisDifficultySchema>;
export const TETRIS_DIFFICULTIES={easy:{gravity:1400,warning:4000,botInterval:350},normal:{gravity:1000,warning:3000,botInterval:200},hard:{gravity:650,warning:2500,botInterval:120}} as const;
export const tetrisActionSchema=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('join'),name:z.string().trim().min(1).max(48)}),
 z.strictObject({type:z.literal('ready'),ready:z.boolean()}),z.strictObject({type:z.literal('start')}),z.strictObject({type:z.literal('leave')}),z.strictObject({type:z.literal('ping')}),
 z.strictObject({type:z.literal('difficulty'),difficulty:tetrisDifficultySchema}),
 z.strictObject({type:z.literal('bot'),pet:petBotSchema.optional(),operation:z.enum(['add','remove']),id:z.string().max(100).optional()}),
 z.strictObject({type:z.literal('input'),round:z.number().int().nonnegative(),seq:z.number().int().nonnegative(),key:z.enum(['left','right','down','cw','ccw','drop','hold','shield','moss','roots']),target:z.string().max(100).optional()}),
]);
export type TetrisAction=z.infer<typeof tetrisActionSchema>;
export type Piece={kind:number;rotation:number;x:number;y:number};
export type TetrisPlayer={id:string;name:string;bot?:boolean;pet?:PetBot;ready:boolean;board:number[][];piece:Piece;next:number[];hold:number|null;held:boolean;alive:boolean;score:number;lines:number;energy:number;cooldown:number;pending:{rows:number;at:number;hole:number}[];seq:number;lastSeen:number;gravity:number;lock:number;resets:number;bagIndex:number;combo:number;target:string|null;lastInput:number;rank:number|null};
export type TetrisView={phase:'lobby'|'countdown'|'playing'|'finished';round:number;startsAt:number;now:number;host:string|null;players:TetrisPlayer[];winner:string|null;solo:boolean;difficulty:TetrisDifficulty};
const shapes=[[[0,1],[1,1],[2,1],[3,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[0,1],[1,1]],[[0,0],[1,0],[1,1],[2,1]],[[0,0],[0,1],[1,1],[2,1]],[[2,0],[0,1],[1,1],[2,1]]];
export function cells(piece:Piece):number[][]{let points=shapes[piece.kind].map(p=>[...p]);if(piece.kind!==1)for(let r=0;r<piece.rotation;r++)points=points.map(([x,y])=>[(piece.kind===0?3:2)-y,x]);return points.map(([x,y])=>[x+piece.x,y+piece.y]);}
export function fits(board:number[][],piece:Piece){return cells(piece).every(([x,y])=>x>=0&&x<10&&y<20&&(y<0||board[y][x]===0));}
export function shiftPiece(p:TetrisPlayer,key:string):boolean{let next={...p.piece};if(key==='left')next.x--;else if(key==='right')next.x++;else if(key==='down')next.y++;else if(key==='cw'||key==='ccw'){next.rotation=(next.rotation+(key==='cw'?1:3))%4;for(const [dx,dy]of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[0,-2]]){const kick={...next,x:next.x+dx,y:next.y+dy};if(fits(p.board,kick)){p.piece=kick;return true;}}return false;}else return false;if(!fits(p.board,next))return false;p.piece=next;return true;}
const empty=()=>Array.from({length:20},()=>Array<number>(10).fill(0));
/** All rules and time are owned by the host/server; no client supplied board is trusted. */
export class TetrisGame implements RoomEngine<TetrisAction,TetrisView>{
 private players=new Map<string,TetrisPlayer>();private phase:TetrisView['phase']='lobby';private round=0;private startsAt=0;private host:string|null=null;private winner:string|null=null;private sequence:number[]=[];private randomState:number;private nextPractice=0;private difficulty:TetrisDifficulty;private botNumber=0;private botTime=new Map<string,number>();
 private petMatch=new PetMatch();
 setPetReservations(registry:PetReservations){this.petMatch.connect(registry);}
 constructor(seed=crypto.getRandomValues(new Uint32Array(1))[0],readonly solo=false,readonly practice=false,difficulty:TetrisDifficulty='normal'){this.randomState=seed||1;this.difficulty=difficulty;}
 private random(n:number){let x=this.randomState;x^=x<<13;x^=x>>>17;x^=x<<5;this.randomState=x>>>0;return this.randomState%n;}
 private number(index:number){while(this.sequence.length<=index){const bag=this.difficulty==='hard'?[0,1,1,2,2,3,3,4,4,5,5,6,6]:[0,1,2,3,4,5,6];for(let i=bag.length-1;i>0;i--){const j=this.random(i+1);[bag[i],bag[j]]=[bag[j],bag[i]];}this.sequence.push(...bag);}return this.sequence[index];}
 private spawn(p:TetrisPlayer,now:number,kind?:number){p.piece={kind:kind??this.number(p.bagIndex++),rotation:0,x:3,y:-1};p.next=[0].map(i=>this.number(p.bagIndex+i));p.gravity=now;p.lock=0;p.resets=0;if(!fits(p.board,p.piece))this.kill(p);}
 private kill(p:TetrisPlayer){if(!p.alive)return;p.alive=false;p.rank=[...this.players.values()].filter(p=>p.alive).length+1;}
 apply(id:string,raw:TetrisAction,now:number){const a=tetrisActionSchema.parse(raw);let p=this.players.get(id);
  if(a.type==='join'){if(id.startsWith('tetris-npc:'))throw Error('Identificador reservado.');if(p){p.lastSeen=now;p.name=a.name;return;}if(this.players.size>=16)throw Error('La sala está llena.');p={id,name:a.name,ready:false,board:empty(),piece:{kind:0,rotation:0,x:3,y:-1},next:[],hold:null,held:false,alive:false,score:0,lines:0,energy:25,cooldown:0,pending:[],seq:-1,lastSeen:now,gravity:now,lock:0,resets:0,bagIndex:0,combo:0,target:null,lastInput:0,rank:null};this.players.set(id,p);this.host??=id;return;}
  if(!p)throw Error('Entra en la sala primero.');p.lastSeen=now;
  if(a.type==='ping')return;
  if(a.type==='difficulty'||a.type==='bot'){
   if(id!==this.host||!['lobby','finished'].includes(this.phase))throw Error('Solo quien organiza puede cambiar la sala antes de comenzar.');
   if(a.type==='difficulty'){this.difficulty=a.difficulty;for(const q of this.players.values())q.ready=!!q.bot;}
   else if(a.operation==='remove'){const q=this.players.get(a.id??'');if(q?.bot){if(q.pet)this.petMatch.remove(q.pet.id,q.pet.owner);this.players.delete(q.id);this.botTime.delete(q.id);}}
   else {
    if(this.solo||this.players.size>=16||(!a.pet&&[...this.players.values()].filter(q=>q.bot&&!q.pet).length>=3))throw Error('No hay espacio para más NPC.');
    const pet=a.pet?this.petMatch.add(a.pet,id):undefined;const botId=pet?`pet:${pet.owner}:${pet.id}`:`tetris-npc:${++this.botNumber}`,bot: TetrisPlayer={...structuredClone(p),id:botId,name:pet?.name??`NPC ${this.botNumber}`,...(pet?{pet}:{}),bot:true,ready:true,board:empty(),alive:false,pending:[],hold:null,held:false,next:[],score:0,lines:0};this.players.set(botId,bot);
   }return;
  }
  if(a.type==='leave'){for(const [key,pet]of this.players)if(pet.pet?.owner===id){this.petMatch.remove(pet.pet.id,pet.pet.owner);this.kill(pet);this.players.delete(key);}this.kill(p);if(this.phase==='lobby'||this.phase==='finished')this.players.delete(id);if(this.host===id)this.host=[...this.players.values()].find(q=>q.id!==id&&!q.bot)?.id??null;this.finish();return;}
  if(a.type==='ready'){if(this.phase==='lobby'||this.phase==='finished')p.ready=a.ready;return;}
  if(a.type==='start'){if(id!==this.host||!['lobby','finished'].includes(this.phase))throw Error('Solo quien organiza puede comenzar.');const all=[...this.players.values()];if(all.length<(this.solo?1:2)||all.some(p=>!p.ready))throw Error('Espera a que todos estén preparados.');this.petMatch.start();this.round++;this.sequence=[];this.phase='countdown';this.startsAt=now+3000;this.nextPractice=this.startsAt+20000;this.winner=null;for(const p of all){Object.assign(p,{board:empty(),hold:null,held:false,alive:true,score:0,lines:0,energy:25,cooldown:0,pending:[],seq:-1,bagIndex:0,combo:0,rank:null,lastSeen:now});this.spawn(p,this.startsAt);}return;}
  if(a.type!=='input'||a.round!==this.round||a.seq<=p.seq||this.phase!=='playing'||!p.alive)return;
  p.seq=a.seq;if(now-p.lastInput<15)return;p.lastInput=now;if(a.target&&this.players.get(a.target)?.alive&&a.target!==id)p.target=a.target;
  if(['shield','moss','roots'].includes(a.key)){this.power(p,a.key,now);return;}
  if(a.key==='hold'){if(p.held)return;const old=p.hold;p.hold=p.piece.kind;this.spawn(p,now,old??undefined);p.held=true;return;}
  if(a.key==='drop'){while(shiftPiece(p,'down'))p.score+=2;this.lockPiece(p,now);this.finish();return;}
  const grounded=!fits(p.board,{...p.piece,y:p.piece.y+1});if(shiftPiece(p,a.key)){if(a.key==='down')p.score++;if(grounded&&p.resets<15){p.lock=now;p.resets++;}}this.finish();
 }
 private power(p:TetrisPlayer,key:string,now:number){const cost=key==='shield'?30:key==='moss'?40:50;if(p.energy<cost||p.cooldown>now)return;if(this.solo&&!this.practice)return;p.energy-=cost;p.cooldown=now+10000;if(key==='shield')this.cancelRows(p,4);if(key==='moss'){let count=0;for(let y=19;y>=0&&count<4;y--)if(p.board[y].includes(8)){p.board[y]=p.board[y].map(v=>v===8?6:v);count++;}}if(key==='roots'){if(this.solo)p.pending.push({rows:2,at:now+TETRIS_DIFFICULTIES[this.difficulty].warning,hole:this.random(10)});else this.attack(p,2,now);}}
 private cancelRows(p:TetrisPlayer,rows:number){while(rows&&p.pending.length){const n=Math.min(rows,p.pending[0].rows);rows-=n;p.pending[0].rows-=n;if(!p.pending[0].rows)p.pending.shift();}return rows;}
 private attack(p:TetrisPlayer,rows:number,now:number){rows=this.cancelRows(p,rows);if(!rows||this.solo)return;const rivals=[...this.players.values()].filter(q=>q.id!==p.id&&q.alive);const target=rivals.find(q=>q.id===p.target)??rivals[this.random(Math.max(1,rivals.length))];if(target&&target.pending.reduce((n,a)=>n+a.rows,0)<40)target.pending.push({rows,at:now+TETRIS_DIFFICULTIES[this.difficulty].warning,hole:this.random(10)});}
 private lockPiece(p:TetrisPlayer,now:number){const points=cells(p.piece);if(points.some(([,y])=>y<0)){this.kill(p);return;}for(const [x,y]of points)p.board[y][x]=p.piece.kind+1;const left=p.board.filter(row=>!row.every(v=>v>0&&v!==8)),n=20-left.length;p.board=[...Array.from({length:n},()=>Array<number>(10).fill(0)),...left];if(n){p.score+=([0,100,300,500,800][n]??800)*(1+Math.floor(p.lines/10));p.lines+=n;p.energy=Math.min(100,p.energy+n*10);p.combo++;this.attack(p,Math.min(6,([0,0,1,2,4][n]??4)+(p.combo>=2?1:0)),now);}else p.combo=0;
  let allowance=4;while(allowance&&p.pending[0]?.at<=now){const attack=p.pending[0];if(p.board[0].some(Boolean)){this.kill(p);break;}p.board.shift();p.board.push(Array.from({length:10},(_,x)=>x===attack.hole?0:8));attack.rows--;allowance--;if(!attack.rows)p.pending.shift();}p.held=false;if(p.alive)this.spawn(p,now);
 }
 tick(now:number){if(!this.petMatch.valid()){this.cancel();return true;}if(this.phase==='lobby'||this.phase==='finished'){let changed=false;for(const [id,p]of this.players)if(!this.solo&&!p.bot&&now-p.lastSeen>15000){this.players.delete(id);changed=true;}if(this.host&&!this.players.has(this.host))this.host=[...this.players.values()].find(p=>!p.bot)?.id??null;if(!this.host&&this.players.size){this.petMatch.clear();this.players.clear();changed=true;}return changed;}if(this.phase==='countdown'&&now>=this.startsAt){this.phase='playing';for(const p of this.players.values())p.gravity=now;return true;}if(this.phase!=='playing')return false;
  if(this.practice&&this.solo&&now>=this.nextPractice){this.nextPractice=now+20000;for(const p of this.players.values())p.pending.push({rows:2,at:now+TETRIS_DIFFICULTIES[this.difficulty].warning,hole:this.random(10)});}
  for(const p of this.players.values()){if(!p.alive)continue;
   if(p.bot&&now-(this.botTime.get(p.id)??0)>=TETRIS_DIFFICULTIES[this.difficulty].botInterval){
    this.botTime.set(p.id,now);
    const key=p.pending.length&&p.energy>=30?'shield':p.board.some(row=>row.includes(8))&&p.energy>=40?'moss':p.energy>=50?'roots':null;
    let move:BotKey='drop';try{move=botMove(p);}catch{/* A validated hard drop guarantees progress when evaluation fails. */}
    const input=key&&p.cooldown<=now?key:move;
    this.apply(p.id,{type:'input',round:this.round,seq:p.seq+1,key:input},now);
   }
   if(!p.alive)continue;if(!this.solo&&!p.bot&&now-p.lastSeen>15000){this.kill(p);continue;}const interval=Math.max(100,TETRIS_DIFFICULTIES[this.difficulty].gravity-Math.floor(p.lines/10)*80);if(now-p.gravity>=interval){shiftPiece(p,'down');p.gravity=now;}if(!fits(p.board,{...p.piece,y:p.piece.y+1})){if(!p.lock)p.lock=now;if(now-p.lock>=500)this.lockPiece(p,now);}else p.lock=0;}this.finish();return true;
 }
 private finish(){if(this.phase!=='playing')return;const alive=[...this.players.values()].filter(p=>p.alive);if(alive.length<=(this.solo?0:1)){this.phase='finished';this.petMatch.release();this.winner=alive[0]?.id??null;if(alive[0])alive[0].rank=1;for(const p of this.players.values())p.ready=!!p.bot;}}
 cancel(){this.petMatch.clear();for(const [id,p]of this.players)if(p.pet)this.players.delete(id);this.phase='lobby';for(const p of this.players.values()){p.alive=false;p.ready=!!p.bot;}this.winner=null;}
 /** Pause is local-only; network rounds always keep running. */
 postpone(ms:number){if(!this.solo)return;this.startsAt+=ms;this.nextPractice+=ms;for(const p of this.players.values()){p.gravity+=ms;if(p.lock)p.lock+=ms;p.cooldown+=ms;for(const a of p.pending)a.at+=ms;}}
 audience(){return [...this.players.values()].filter(p=>!p.bot).map(p=>p.id);}
 viewFor(_id:string,now:number):TetrisView{return structuredClone({phase:this.phase,round:this.round,startsAt:this.startsAt,now,host:this.host,players:[...this.players.values()],winner:this.winner,solo:this.solo,difficulty:this.difficulty});}
}


type BotKey=Extract<TetrisAction,{type:'input'}>['key'];
/** Search legal paths on the bot's own board. No access to opponents or the future bag. */
export function botMove(player:TetrisPlayer):BotKey {
 function search(piece:Piece){
  const queue:{piece:Piece;first:BotKey;steps:number}[]=[{piece,first:'drop',steps:0}],seen=new Set<string>();
  let best={score:-Infinity,key:'drop' as BotKey};
  for(let i=0;i<queue.length&&i<1800;i++){
   const node=queue[i],key=`${node.piece.x}:${node.piece.y}:${node.piece.rotation}`;if(seen.has(key))continue;seen.add(key);
   const landing={...node.piece};while(fits(player.board,{...landing,y:landing.y+1}))landing.y++;
   const points=cells(landing);if(points.every(([,y])=>y>=0)){
    let board=player.board.map(r=>[...r]);for(const [x,y]of points)board[y][x]=landing.kind+1;
    board=board.filter(r=>!r.every(v=>v>0&&v!==8));const lines=20-board.length;while(board.length<20)board.unshift(Array<number>(10).fill(0));
    const heights=Array.from({length:10},(_,x)=>{const y=board.findIndex(r=>r[x]>0);return y<0?0:20-y;});
    let holes=0;for(let x=0;x<10;x++)for(let y=20-heights[x];y<20;y++)if(!board[y][x])holes++;
    const bump=heights.slice(1).reduce((n,h,i)=>n+Math.abs(h-heights[i]),0);
    const score=lines*12-holes*9-heights.reduce((a,b)=>a+b,0)*.65-bump*.45-Math.max(...heights)*.8-node.steps*.01;
    if(score>best.score)best={score,key:node.first};
   }
   for(const action of ['left','right','cw','ccw','down'] as const){const p={...player,piece:{...node.piece}};if(shiftPiece(p,action)&&p.piece.y>=-3)queue.push({piece:p.piece,first:node.steps?node.first:action,steps:node.steps+1});}
  }return best;
 }
 const move=search(player.piece);
 if(!player.held){const kind=player.hold??player.next[0];if(kind!==undefined){const piece={kind,rotation:0,x:3,y:-1};if(fits(player.board,piece)&&search(piece).score>move.score+.75)return 'hold';}}
 return move.key;
}
